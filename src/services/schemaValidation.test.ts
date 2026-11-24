import { describe, expect, it } from 'vitest';
import { validateOdysseyBackup } from './schemaValidation';
import { MAX_REFLECTION_LENGTH } from '../lib/reflection';

describe('validateOdysseyBackup', () => {
  it('validates a complete standard export package successfully', () => {
    const backup = {
      version: 1,
      app: 'odyssey',
      exported_at: '2026-11-02T10:00:00.000Z',
      data: {
        tasks: [
          {
            id: 'd1985478-f9b2-4d2b-a8d8-7b9c9f28a6f1',
            title: 'Complete project documentation',
            status: 'todo',
            priority: 'high',
            estimated_minutes: 45,
          },
        ],
        missions: [
          {
            id: 'a1985478-f9b2-4d2b-a8d8-7b9c9f28a6f2',
            title: 'Draft architecture section',
            planned_minutes: 30,
            status: 'planned',
          },
        ],
        sessions: [
          {
            id: 'b1985478-f9b2-4d2b-a8d8-7b9c9f28a6f3',
            started_at: '2026-11-02T10:00:00.000Z',
            completed: true,
            duration_minutes: 25,
          },
        ],
      },
    };

    const result = validateOdysseyBackup(backup);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.data?.tasks).toHaveLength(1);
    expect(result.data?.missions).toHaveLength(1);
    expect(result.data?.sessions).toHaveLength(1);
    expect(result.summary?.task_count).toBe(1);
    expect(result.summary?.mission_count).toBe(1);
    expect(result.summary?.session_count).toBe(1);
  });

  it('validates flat collections and focus_sessions alias', () => {
    const flat = {
      tasks: [{ title: 'Quick task' }],
      missions: [{ title: 'Quick mission', planned_minutes: 25 }],
      focus_sessions: [{ started_at: '2026-11-02T11:00:00.000Z' }],
    };

    const result = validateOdysseyBackup(flat);
    expect(result.valid).toBe(true);
    expect(result.data?.tasks[0].title).toBe('Quick task');
    expect(result.data?.tasks[0].status).toBe('todo');
    expect(result.data?.missions[0].planned_minutes).toBe(25);
    expect(result.data?.sessions).toHaveLength(1);
  });

  it('preserves normalized tags and defaults legacy tasks to no tags', () => {
    const result = validateOdysseyBackup({
      tasks: [
        { title: 'Tagged', tags: ['Work', 'work', 'cs101', '#bad', '1'] },
        { title: 'Legacy task' },
      ],
      missions: [],
      sessions: [],
    });

    expect(result.valid).toBe(true);
    expect(result.data?.tasks.map(task => task.tags)).toEqual([['work', 'cs101'], []]);
  });

  it('rejects non-object root', () => {
    expect(validateOdysseyBackup(null).valid).toBe(false);
    expect(validateOdysseyBackup([]).valid).toBe(false);
    expect(validateOdysseyBackup('string').valid).toBe(false);
  });

  it('rejects unrecognized format when no recognizable keys exist', () => {
    const result = validateOdysseyBackup({ foo: 'bar', baz: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Unrecognized backup format');
  });

  it('flags tasks with empty titles or invalid statuses', () => {
    const invalidTasks = {
      tasks: [
        { title: '', status: 'invalid_status' },
      ],
      missions: [],
      sessions: [],
    };

    const result = validateOdysseyBackup(invalidTasks);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'tasks[0].title')).toBe(true);
    expect(result.errors.some(e => e.path === 'tasks[0].status')).toBe(true);
  });

  it('flags missions with invalid duration (out of 1-240 or non-integer)', () => {
    const invalidMissions = {
      tasks: [],
      missions: [
        { title: 'Bad duration', planned_minutes: 0 },
        { title: 'Too long', planned_minutes: 241 },
        { title: 'Fractional', planned_minutes: 15.5 },
      ],
      sessions: [],
    };

    const result = validateOdysseyBackup(invalidMissions);
    expect(result.valid).toBe(false);
    expect(result.errors.filter(e => e.path.includes('planned_minutes'))).toHaveLength(3);
  });

  it('flags sessions with invalid started_at or negative duration', () => {
    const invalidSessions = {
      tasks: [],
      missions: [],
      sessions: [
        { started_at: 'not-a-date', duration_minutes: -10, completed: 'not-a-boolean' },
      ],
    };

    const result = validateOdysseyBackup(invalidSessions);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'sessions[0].started_at')).toBe(true);
    expect(result.errors.some(e => e.path === 'sessions[0].duration_minutes')).toBe(true);
    expect(result.errors.some(e => e.path === 'sessions[0].completed')).toBe(true);
  });

  describe('mission reflection', () => {
    const MISSION_ID = 'a1985478-f9b2-4d2b-a8d8-7b9c9f28a6f2';
    const backupWith = (mission: Record<string, unknown>) => ({
      version: 1,
      app: 'odyssey',
      data: { tasks: [], missions: [{ id: MISSION_ID, title: 'Draft', planned_minutes: 25, status: 'completed', ...mission }], sessions: [] },
    });

    it('keeps a reflection note, trimmed', () => {
      const result = validateOdysseyBackup(backupWith({ reflection: '  Pointer arithmetic finally clicked.  ' }));
      expect(result.valid).toBe(true);
      expect(result.data?.missions[0].reflection).toBe('Pointer arithmetic finally clicked.');
    });

    it('caps a very long reflection instead of rejecting the backup', () => {
      const result = validateOdysseyBackup(backupWith({ reflection: 'x'.repeat(5000) }));
      expect(result.valid).toBe(true);
      expect(result.data?.missions[0].reflection).toHaveLength(MAX_REFLECTION_LENGTH);
    });

    it.each([undefined, null, '', '   \n ', 42, { text: 'nope' }, ['a']])(
      'leaves the reflection out for %j so old and blank notes import cleanly',
      value => {
        const result = validateOdysseyBackup(backupWith({ reflection: value }));
        expect(result.valid).toBe(true);
        expect(result.data?.missions[0]).not.toHaveProperty('reflection');
      },
    );

    it('still imports a backup written before debriefs existed', () => {
      const oldBackup = {
        version: 1,
        app: 'odyssey',
        exported_at: '2026-10-01T00:00:00.000Z',
        data: {
          tasks: [],
          missions: [{
            id: MISSION_ID, user_id: 'u1', task_id: null, title: 'Old mission', objective: 'Do it', next_action: 'Start',
            planned_minutes: 25, status: 'completed', started_at: null, completed_at: '2026-10-01T00:00:00.000Z',
            created_at: '2026-10-01T00:00:00.000Z',
          }],
          sessions: [],
        },
      };
      const result = validateOdysseyBackup(oldBackup);
      expect(result.valid).toBe(true);
      expect(result.data?.missions[0]).toMatchObject({ title: 'Old mission', objective: 'Do it', next_action: 'Start' });
      expect(result.data?.missions[0]).not.toHaveProperty('reflection');
    });
  });
});


describe('waypoint sentiment backup validation', () => {
  const backup = (mission: object) => ({ tasks: [], missions: [{ title: 'Waypoint', planned_minutes: 25, ...mission }], sessions: [] });
  it.each(['flow', 'focused', 'climb', 'fatigued'])('keeps valid %s tags', sentiment => {
    const result = validateOdysseyBackup(backup({ sentiment }));
    expect(result.valid).toBe(true);
    expect(result.data?.missions[0].sentiment).toBe(sentiment);
  });
  it.each(['unknown', '', 42])('rejects invalid imported sentiment %j', sentiment => {
    const result = validateOdysseyBackup(backup({ sentiment }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.path === 'missions[0].sentiment')).toBe(true);
  });
  it('keeps older backups without a sentiment key compatible', () => {
    const result = validateOdysseyBackup(backup({}));
    expect(result.valid).toBe(true);
    expect(result.data?.missions[0]).not.toHaveProperty('sentiment');
  });
});
