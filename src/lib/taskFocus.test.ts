import { beforeEach, describe, expect, it } from 'vitest';
import type { FocusSession, Mission } from '../types/database';
import { clearLocalStore, localMissions, localSessions, localTasks } from './localStore';
import {
  DEFAULT_TASK_OUTCOME,
  TASK_OUTCOME_OPTIONS,
  formatTaskFocus,
  resolveLinkedTaskId,
  taskFocusTotals,
  taskIdToComplete,
} from './taskFocus';

function mission(id: string, taskId: string | null, over: Partial<Mission> = {}): Mission {
  return {
    id,
    user_id: 'u1',
    task_id: taskId,
    title: `Mission ${id}`,
    objective: null,
    next_action: null,
    planned_minutes: 25,
    status: 'completed',
    started_at: null,
    completed_at: '2026-01-10T10:00:00.000Z',
    created_at: '2026-01-01T10:00:00.000Z',
    ...over,
  };
}

function session(id: string, missionId: string | null, minutes: number | null, completed = true): FocusSession {
  return {
    id,
    user_id: 'u1',
    mission_id: missionId,
    started_at: '2026-01-10T09:00:00.000Z',
    ended_at: null,
    duration_minutes: minutes,
    completed,
    created_at: '2026-01-10T09:00:00.000Z',
  };
}

describe('finish choice for a linked task', () => {
  it('offers "Keep task in progress" first and defaults to it', () => {
    expect(DEFAULT_TASK_OUTCOME).toBe('keep');
    expect(TASK_OUTCOME_OPTIONS.map(o => o.label)).toEqual(['Keep task in progress', 'Mark task completed']);
    expect(TASK_OUTCOME_OPTIONS[0].value).toBe(DEFAULT_TASK_OUTCOME);
  });

  it('only returns a task to complete for "Mark task completed"', () => {
    expect(taskIdToComplete('keep', 't1')).toBeNull();
    expect(taskIdToComplete('complete', 't1')).toBe('t1');
    expect(taskIdToComplete('complete', null)).toBeNull();
    expect(taskIdToComplete('complete', undefined)).toBeNull();
  });

  it('prefers the task the mission was launched from over the mission task_id', () => {
    expect(resolveLinkedTaskId('launched', 'stored')).toBe('launched');
    expect(resolveLinkedTaskId(null, 'stored')).toBe('stored');
    expect(resolveLinkedTaskId(undefined, null)).toBeNull();
  });
});

describe('taskFocusTotals', () => {
  it('adds up sessions and minutes across every mission of a task', () => {
    const totals = taskFocusTotals(
      [mission('m1', 't1'), mission('m2', 't1'), mission('m3', 't2')],
      [session('s1', 'm1', 25), session('s2', 'm2', 25), session('s3', 'm3', 10)],
    );
    expect(totals.get('t1')).toEqual({ sessions: 2, minutes: 50 });
    expect(totals.get('t2')).toEqual({ sessions: 1, minutes: 10 });
  });

  it('counts paused segments as minutes but only the finished one as a session', () => {
    const totals = taskFocusTotals(
      [mission('m1', 't1')],
      [session('s1', 'm1', 10, false), session('s2', 'm1', 15, true)],
    );
    expect(totals.get('t1')).toEqual({ sessions: 1, minutes: 25 });
  });

  it('ignores missions without a task and sessions without a known mission', () => {
    const totals = taskFocusTotals(
      [mission('m1', null), mission('m2', 't1')],
      [session('s1', 'm1', 30), session('s2', null, 30), session('s3', 'gone', 30), session('s4', 'm2', 5)],
    );
    expect([...totals.keys()]).toEqual(['t1']);
    expect(totals.get('t1')).toEqual({ sessions: 1, minutes: 5 });
  });

  it('has no entry for a task whose missions have no sessions yet', () => {
    expect(taskFocusTotals([mission('m1', 't1', { status: 'planned' })], []).size).toBe(0);
  });
});

describe('formatTaskFocus', () => {
  it.each([
    [{ sessions: 2, minutes: 50 }, '2 sessions · 50m logged'],
    [{ sessions: 1, minutes: 25 }, '1 session · 25m logged'],
    [{ sessions: 3, minutes: 135 }, '3 sessions · 2h 15m logged'],
    [{ sessions: 0, minutes: 12 }, '12m logged'],
  ])('formats %o as %s', (totals, text) => {
    expect(formatTaskFocus(totals)).toBe(text);
  });

  it('returns null when nothing is logged', () => {
    expect(formatTaskFocus(undefined)).toBeNull();
    expect(formatTaskFocus(null)).toBeNull();
    expect(formatTaskFocus({ sessions: 0, minutes: 0 })).toBeNull();
  });
});

// The same sequence Execute runs after a mission is finished, against the local store.
describe('finishing missions of one task (local storage)', () => {
  beforeEach(() => clearLocalStore());

  function runMission(taskId: string, minutesLogged: number) {
    const m = localMissions.create({ title: 'Study DS', task_id: taskId, planned_minutes: 25 });
    const s = localSessions.start(m.id);
    localSessions.end(s.id, true);
    localSessions.replaceAll(localSessions.getAll().map(x => (x.id === s.id ? { ...x, duration_minutes: minutesLogged } : x)));
    localMissions.update(m.id, { status: 'completed', completed_at: new Date().toISOString() });
    return m;
  }

  it('keeps the task open after "Keep task in progress" and accumulates the totals', () => {
    const task = localTasks.create({ title: 'Study Data Structures' });
    runMission(task.id, 25);
    const closeId = taskIdToComplete('keep', task.id);
    if (closeId) localTasks.complete(closeId);
    runMission(task.id, 25);

    expect(localTasks.getAll().find(t => t.id === task.id)).toMatchObject({ status: 'todo', completed_at: null });
    const totals = taskFocusTotals(localMissions.getAll(), localSessions.getAll());
    expect(formatTaskFocus(totals.get(task.id))).toBe('2 sessions · 50m logged');
  });

  it('completes the task only after "Mark task completed"', () => {
    const task = localTasks.create({ title: 'Build Portfolio' });
    runMission(task.id, 25);
    const closeId = taskIdToComplete('complete', task.id);
    if (closeId) localTasks.complete(closeId);

    const saved = localTasks.getAll().find(t => t.id === task.id);
    expect(saved?.status).toBe('completed');
    expect(saved?.completed_at).not.toBeNull();
  });

  it('does not leave dangling links when a task is deleted', () => {
    const task = localTasks.create({ title: 'Final Exam Prep' });
    const m = runMission(task.id, 25);
    localTasks.delete(task.id);

    expect(localMissions.getOne(m.id).task_id).toBeNull();
    expect(localSessions.getForMission(m.id)).toHaveLength(1);
    expect(taskFocusTotals(localMissions.getAll(), localSessions.getAll()).size).toBe(0);
  });

  it('keeps sessions in the history but unlinks them when a mission is deleted', () => {
    const task = localTasks.create({ title: 'Study DS' });
    const m = runMission(task.id, 25);
    localMissions.delete(m.id);

    const sessions = localSessions.getAll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].mission_id).toBeNull();
    expect(taskFocusTotals(localMissions.getAll(), sessions).size).toBe(0);
  });
});
