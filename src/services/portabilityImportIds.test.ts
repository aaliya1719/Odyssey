import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Task, Mission, FocusSession } from '../types/database';

// Tiny in-memory stand-in for the three Supabase tables. It reproduces the errors
// from issue #62: tasks_pkey on a plain insert, the RLS error when an upsert hits a
// row owned by someone else, and "cannot affect row a second time" inside one upsert.
type Row = { id: string; user_id: string };
type Cols = Row & Record<string, unknown>;
const tables: Record<string, Cols[]> = { tasks: [], missions: [], focus_sessions: [] };
let currentUser = 'user-b';
let upsertCalls = 0;
let failNextInsertOn: string | null = null;

const fkCols: Record<string, [string, string]> = {
  missions: ['task_id', 'tasks'],
  focus_sessions: ['mission_id', 'missions'],
};

function checkFk(table: string, row: Cols, pending: Cols[]) {
  const fk = fkCols[table];
  if (!fk) return null;
  const ref = row[fk[0]] as string | null;
  if (ref && !tables[fk[1]].some((r) => r.id === ref) && !(fk[1] === table && pending.some((r) => r.id === ref))) {
    return new Error(`insert or update on table "${table}" violates foreign key constraint`);
  }
  return null;
}

function from(table: string) {
  const rows = () => tables[table];
  return {
    select: (_cols?: string) => {
      const filters: ((r: Cols) => boolean)[] = [(r) => r.user_id === currentUser]; // RLS
      const q = {
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows().filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })), error: null }).then(res),
      };
      return q;
    },
    delete: () => ({
      eq: (c: string, v: unknown) => {
        tables[table] = rows().filter((r) => !(r.user_id === currentUser && r[c] === v));
        return Promise.resolve({ error: null });
      },
    }),
    insert: (batch: Cols[]) => {
      if (failNextInsertOn === table) {
        failNextInsertOn = null;
        return Promise.resolve({ error: new Error(`simulated ${table} failure`) });
      }
      const seen = new Set(rows().map((r) => r.id));
      for (const r of batch) {
        if (r.user_id !== currentUser) return Promise.resolve({ error: new Error('new row violates row-level security policy for table "' + table + '"') });
        if (seen.has(r.id)) return Promise.resolve({ error: new Error(`duplicate key value violates unique constraint "${table}_pkey"`) });
        seen.add(r.id);
      }
      for (const r of batch) {
        const err = checkFk(table, r, batch);
        if (err) return Promise.resolve({ error: err });
      }
      tables[table].push(...batch.map((r) => ({ ...r })));
      return Promise.resolve({ error: null });
    },
    upsert: (batch: Cols[]) => {
      upsertCalls++;
      const ids = batch.map((r) => r.id);
      if (new Set(ids).size !== ids.length) {
        return Promise.resolve({ error: new Error('ON CONFLICT DO UPDATE command cannot affect row a second time') });
      }
      for (const r of batch) {
        const hit = rows().find((x) => x.id === r.id);
        if (hit && hit.user_id !== currentUser) {
          return Promise.resolve({ error: new Error(`new row violates row-level security policy (USING expression) for table "${table}"`) });
        }
        if (r.user_id !== currentUser) return Promise.resolve({ error: new Error('new row violates row-level security policy') });
      }
      for (const r of batch) {
        const err = checkFk(table, r, batch);
        if (err) return Promise.resolve({ error: err });
      }
      for (const r of batch) {
        const i = rows().findIndex((x) => x.id === r.id);
        if (i >= 0) tables[table][i] = { ...r };
        else tables[table].push({ ...r });
      }
      return Promise.resolve({ error: null });
    },
  };
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: currentUser } } })) },
    from: (table: string) => from(table),
  },
}));

import { portabilityService, prepareDataForImport, type OwnedIds } from './portabilityService';
import type { OdysseyExportData } from '../types/portability';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '11111111-1111-4111-8111-222222222222';
const M1 = '22222222-2222-4222-8222-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const S1 = '33333333-3333-4333-8333-111111111111';
const S2 = '33333333-3333-4333-8333-222222222222';
const now = '2026-11-17T10:00:00.000Z';

const task = (id: string, title = 't', user_id = 'user-a'): Task => ({
  id, user_id, title, description: null, status: 'todo', priority: 'medium', deadline: null,
  estimated_minutes: null, source: null, source_id: null, created_at: now, updated_at: now, completed_at: null,
});
const mission = (id: string, task_id: string | null, title = 'm', user_id = 'user-a'): Mission => ({
  id, user_id, task_id, title, objective: null, next_action: null, planned_minutes: 25, status: 'planned',
  started_at: null, completed_at: null, created_at: now,
});
const session = (id: string, mission_id: string | null, user_id = 'user-a'): FocusSession => ({
  id, user_id, mission_id, started_at: now, ended_at: null, duration_minutes: null, completed: false, created_at: now,
});

// What account A exported: task, two missions (one on the task), two sessions.
const backupOfA = (): OdysseyExportData => ({
  tasks: [task(T1, 'A task'), task(T2, 'A other task')],
  missions: [mission(M1, T1, 'A mission'), mission(M2, null, 'A free mission')],
  sessions: [session(S1, M1), session(S2, M2)],
});
const owned = (o: Partial<Record<'tasks' | 'missions' | 'sessions', string[]>> = {}): OwnedIds => ({
  tasks: new Set(o.tasks ?? []), missions: new Set(o.missions ?? []), sessions: new Set(o.sessions ?? []),
});

describe('prepareDataForImport id remapping', () => {
  it('replace: every row gets a fresh id and references follow the new ids', () => {
    const out = prepareDataForImport(backupOfA(), 'user-b', { strategy: 'replace' });
    const oldIds = [T1, T2, M1, M2, S1, S2];
    const newIds = [...out.tasks, ...out.missions, ...out.sessions].map((r) => r.id);
    expect(new Set(newIds).size).toBe(6);
    for (const id of newIds) {
      expect(id).toMatch(UUID);
      expect(oldIds).not.toContain(id);
    }
    expect(out.missions[0].task_id).toBe(out.tasks[0].id);
    expect(out.missions[1].task_id).toBeNull();
    expect(out.sessions[0].mission_id).toBe(out.missions[0].id);
    expect(out.sessions[1].mission_id).toBe(out.missions[1].id);
    expect([...out.tasks, ...out.missions, ...out.sessions].every((r) => r.user_id === 'user-b')).toBe(true);
  });

  it('replace: ignores ownedIds, even ids the user owns are regenerated', () => {
    const out = prepareDataForImport(backupOfA(), 'user-b', { strategy: 'replace', ownedIds: owned({ tasks: [T1] }) });
    expect(out.tasks[0].id).not.toBe(T1);
  });

  it('merge: keeps ids the user already owns and remaps the rest', () => {
    const out = prepareDataForImport(backupOfA(), 'user-b', {
      strategy: 'merge',
      ownedIds: owned({ tasks: [T1], missions: [M1] }),
    });
    expect(out.tasks[0].id).toBe(T1);
    expect(out.tasks[1].id).not.toBe(T2);
    expect(out.missions[0].id).toBe(M1);
    expect(out.missions[1].id).not.toBe(M2);
    expect(out.missions[0].task_id).toBe(T1);
    expect(out.sessions[0].id).not.toBe(S1);
    expect(out.sessions[0].mission_id).toBe(M1);
    expect(out.sessions[1].mission_id).toBe(out.missions[1].id);
  });

  it('merge: a remapped task keeps its missions linked', () => {
    const out = prepareDataForImport(backupOfA(), 'user-b', { strategy: 'merge', ownedIds: owned() });
    expect(out.tasks[0].id).not.toBe(T1);
    expect(out.missions[0].task_id).toBe(out.tasks[0].id);
  });

  it('merge: matches owned ids case-insensitively', () => {
    const raw = backupOfA();
    raw.tasks[0].id = T1.toUpperCase();
    const out = prepareDataForImport(raw, 'user-b', { strategy: 'merge', ownedIds: owned({ tasks: [T1] }) });
    expect(out.tasks[0].id).toBe(T1.toUpperCase());
    expect(out.missions[0].task_id).toBe(T1.toUpperCase());
  });

  it('merge: a repeated id inside the file is used once, the copy gets a new id', () => {
    const raw: OdysseyExportData = {
      tasks: [task(T1, 'first'), task(T1, 'second')],
      missions: [mission(M1, T1)],
      sessions: [],
    };
    const out = prepareDataForImport(raw, 'user-b', { strategy: 'merge', ownedIds: owned({ tasks: [T1] }) });
    expect(out.tasks[0].id).toBe(T1);
    expect(out.tasks[1].id).not.toBe(T1);
    expect(out.tasks[1].id).toMatch(UUID);
    expect(out.tasks[1].title).toBe('second');
    expect(new Set(out.tasks.map((t) => t.id)).size).toBe(2);
    expect(out.missions[0].task_id).toBe(T1);
  });

  it('replace: a repeated id inside the file ends up as two distinct rows', () => {
    const raw: OdysseyExportData = { tasks: [task(T1, 'a'), task(T1, 'b')], missions: [], sessions: [] };
    const out = prepareDataForImport(raw, 'user-b', { strategy: 'replace' });
    expect(out.tasks).toHaveLength(2);
    expect(out.tasks[0].id).not.toBe(out.tasks[1].id);
  });

  it('invalid ids are regenerated and references to them still resolve', () => {
    const raw: OdysseyExportData = {
      tasks: [task('not-a-uuid', 'x')],
      missions: [mission(M1, 'not-a-uuid')],
      sessions: [],
    };
    const out = prepareDataForImport(raw, 'user-b', { strategy: 'merge', ownedIds: owned({ tasks: ['not-a-uuid'] }) });
    expect(out.tasks[0].id).toMatch(UUID);
    expect(out.missions[0].task_id).toBe(out.tasks[0].id);
  });

  it('references to rows that are not in the file become null', () => {
    const raw: OdysseyExportData = {
      tasks: [],
      missions: [mission(M1, T1)],
      sessions: [session(S1, M2)],
    };
    const out = prepareDataForImport(raw, 'user-b', { strategy: 'replace' });
    expect(out.missions[0].task_id).toBeNull();
    expect(out.sessions[0].mission_id).toBeNull();
  });

  it('does not mutate the input', () => {
    const raw = backupOfA();
    const copy = JSON.parse(JSON.stringify(raw));
    prepareDataForImport(raw, 'user-b', { strategy: 'replace' });
    expect(raw).toEqual(copy);
  });
});

describe('restoreUserData from another account (issue 62)', () => {
  beforeEach(() => {
    upsertCalls = 0;
    failNextInsertOn = null;
    currentUser = 'user-b';
    const rows = (r: unknown[]) => r as Cols[];
    tables.tasks = rows([task(T1, 'A task'), task(T2, 'A other task'), task('44444444-4444-4444-8444-444444444444', 'B existing', 'user-b')]);
    tables.missions = rows([mission(M1, T1, 'A mission'), mission(M2, null, 'A free mission')]);
    tables.focus_sessions = rows([session(S1, M1), session(S2, M2)]);
  });

  const aRows = (t: string) => tables[t].filter((r) => r.user_id === 'user-a');
  const bRows = (t: string) => tables[t].filter((r) => r.user_id === 'user-b');

  it('merge: imports A\'s backup into B and leaves A untouched', async () => {
    const aBefore = JSON.stringify([aRows('tasks'), aRows('missions'), aRows('focus_sessions')]);
    const res = await portabilityService.restoreUserData(backupOfA(), 'merge');
    expect(res).toMatchObject({ success: true, tasksImported: 2, missionsImported: 2, sessionsImported: 2 });
    expect(JSON.stringify([aRows('tasks'), aRows('missions'), aRows('focus_sessions')])).toBe(aBefore);
    expect(bRows('tasks').map((t) => t.title).sort()).toEqual(['A other task', 'A task', 'B existing']);
    expect(bRows('missions')).toHaveLength(2);
    expect(bRows('focus_sessions')).toHaveLength(2);
    // links inside B point at B's own copies
    const bTask = bRows('tasks').find((t) => t.title === 'A task')!;
    const bMission = bRows('missions').find((m) => m.title === 'A mission')!;
    expect(bMission.task_id).toBe(bTask.id);
    expect(bRows('focus_sessions').some((s) => s.mission_id === bMission.id)).toBe(true);
  });

  it('replace: imports A\'s backup into B, wipes B\'s old rows and leaves A untouched', async () => {
    const aBefore = JSON.stringify([aRows('tasks'), aRows('missions'), aRows('focus_sessions')]);
    const res = await portabilityService.restoreUserData(backupOfA(), 'replace');
    expect(res).toMatchObject({ success: true, tasksImported: 2, missionsImported: 2, sessionsImported: 2 });
    expect(JSON.stringify([aRows('tasks'), aRows('missions'), aRows('focus_sessions')])).toBe(aBefore);
    expect(bRows('tasks').map((t) => t.title).sort()).toEqual(['A other task', 'A task']);
    const bTask = bRows('tasks').find((t) => t.title === 'A task')!;
    expect(bRows('missions').find((m) => m.title === 'A mission')!.task_id).toBe(bTask.id);
  });

  it('merge: a file with the same id twice imports both rows', async () => {
    const raw = backupOfA();
    raw.tasks.push(task(T1, 'A task again'));
    const res = await portabilityService.restoreUserData(raw, 'merge');
    expect(res.success).toBe(true);
    expect(res.tasksImported).toBe(3);
    expect(bRows('tasks').filter((t) => String(t.title).startsWith('A task'))).toHaveLength(2);
  });

  it('merge: re-importing B\'s own export updates in place instead of duplicating', async () => {
    const own = task('44444444-4444-4444-8444-444444444444', 'B existing (edited)', 'user-b');
    const res = await portabilityService.restoreUserData({ tasks: [own], missions: [], sessions: [] }, 'merge');
    expect(res.success).toBe(true);
    const titles = bRows('tasks').map((t) => t.title);
    expect(titles).toEqual(['B existing (edited)']);
    expect(upsertCalls).toBe(1);
  });

  it('replace: when an insert fails B\'s old data is rolled back and A is untouched', async () => {
    failNextInsertOn = 'missions';
    const bBefore = JSON.stringify(bRows('tasks'));
    const aBefore = JSON.stringify(aRows('tasks'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await portabilityService.restoreUserData(backupOfA(), 'replace');
    errSpy.mockRestore();
    expect(res.success).toBe(false);
    expect(res.error).toContain('simulated missions failure');
    expect(res.error).toContain('safely rolled back and preserved');
    expect(JSON.stringify(bRows('tasks'))).toBe(bBefore);
    expect(JSON.stringify(aRows('tasks'))).toBe(aBefore);
  });
});
