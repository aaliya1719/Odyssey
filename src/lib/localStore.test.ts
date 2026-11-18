import { describe, expect, it } from 'vitest';
import { clearLocalStore, localMissions, localTasks } from './localStore';
import type { CreateMissionInput } from '../services/missionService';
import type { Task } from '../types/database';

describe('local mission persistence duration guard', () => {
  it.each([undefined, null, 0, -1, 1.5, 241, NaN, Infinity])
    ('rejects invalid duration %s before creating a mission', value => {
      expect(() => localMissions.create({ title: 'Test', planned_minutes: value } as CreateMissionInput))
        .toThrow(RangeError);
    });

  it('rejects an invalid duration update before loading stored data', () => {
    expect(() => localMissions.update('mission-id', { planned_minutes: 0 })).toThrow(RangeError);
  });
});

describe('local task tag persistence', () => {
  it('normalizes tags when creating and loading tasks', () => {
    clearLocalStore();
    localTasks.create({ title: 'Tagged task', tags: ['Work', 'work', 'cs101'] });

    expect(localTasks.getAll()[0].tags).toEqual(['work', 'cs101']);
    clearLocalStore();
  });

  it('adds an empty tag array when loading a legacy task', () => {
    clearLocalStore();
    localTasks.replaceAll([{
      id: 'legacy-task',
      user_id: 'local-anon',
      title: 'Legacy task',
      description: null,
      status: 'todo',
      priority: 'medium',
      deadline: null,
      estimated_minutes: null,
      source: null,
      source_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    } as Task]);

    expect(localTasks.getAll()[0].tags).toEqual([]);
    clearLocalStore();
  });
});
