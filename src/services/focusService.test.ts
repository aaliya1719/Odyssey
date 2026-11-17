import { beforeEach, describe, expect, it, vi } from 'vitest';

// Small in-memory stand-in for the focus_sessions table. It has some latency and it
// enforces the partial unique index from the migration (one open session per mission),
// answering with Postgres error 23505 the way PostgREST does.
type Row = { id: string; user_id: string; mission_id: string; started_at: string; ended_at: string | null };
const rows: Row[] = [];
let nextId = 1;
let insertError: { code: string; message: string } | null = null;
let selectError: { code: string; message: string } | null = null;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

vi.mock('../lib/supabase', () => {
  const from = () => {
    const state: { op: 'select' | 'insert'; values?: Partial<Row>; filters: Array<(r: Row) => boolean> } = { op: 'select', filters: [] };
    const api = {
      select: () => api,
      insert: (values: Partial<Row>) => { state.op = 'insert'; state.values = values; return api; },
      eq: (col: keyof Row, value: unknown) => { state.filters.push(r => r[col] === value); return api; },
      is: (col: keyof Row, value: unknown) => { state.filters.push(r => r[col] === value); return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => {
        await sleep(20);
        if (selectError) return { data: null, error: selectError };
        return { data: rows.filter(r => state.filters.every(f => f(r)))[0] ?? null, error: null };
      },
      single: async () => {
        await sleep(20);
        if (insertError) return { data: null, error: insertError };
        const values = state.values as Row;
        if (rows.some(r => r.mission_id === values.mission_id && r.ended_at === null)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "focus_sessions_one_open_per_mission"' } };
        }
        const row: Row = { ...values, id: `s${nextId++}`, ended_at: null } as Row;
        rows.push(row);
        return { data: row, error: null };
      },
    };
    return api;
  };
  return { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from } };
});

import { focusService } from './focusService';

const open = (missionId: string) => rows.filter(r => r.mission_id === missionId && r.ended_at === null);

describe('focusService.startSession (signed in)', () => {
  beforeEach(() => {
    rows.length = 0;
    nextId = 1;
    insertError = null;
    selectError = null;
  });

  it('opens a session when none is open', async () => {
    const session = await focusService.startSession('m1');
    expect(session.mission_id).toBe('m1');
    expect(open('m1')).toHaveLength(1);
  });

  it('returns the existing open session instead of adding another', async () => {
    const first = await focusService.startSession('m1');
    const second = await focusService.startSession('m1');
    expect(second.id).toBe(first.id);
    expect(open('m1')).toHaveLength(1);
  });

  it('two overlapping calls (double click, two tabs) end up on the same single open session', async () => {
    const [a, b] = await Promise.all([focusService.startSession('m1'), focusService.startSession('m1')]);
    expect(open('m1')).toHaveLength(1);
    expect(a.id).toBe(b.id);
  });

  it('does not mix up different missions', async () => {
    await Promise.all([focusService.startSession('m1'), focusService.startSession('m2')]);
    expect(open('m1')).toHaveLength(1);
    expect(open('m2')).toHaveLength(1);
  });

  it('still throws other insert errors', async () => {
    insertError = { code: '42501', message: 'permission denied' };
    await expect(focusService.startSession('m1')).rejects.toMatchObject({ code: '42501' });
  });

  it('throws the original error if the unique violation happens but no open session can be found', async () => {
    insertError = { code: '23505', message: 'duplicate key' };
    await expect(focusService.startSession('m1')).rejects.toMatchObject({ code: '23505' });
  });
});
