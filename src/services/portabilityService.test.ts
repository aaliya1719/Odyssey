import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn(),
  },
}));

import { portabilityService } from './portabilityService';
import { localStore } from '../lib/localStore';

describe('portabilityService', () => {
  beforeEach(() => {
    localStore.clearAll();
  });

  it('exports structured JSON package with version and counts', async () => {
    // Populate local store with 1 task and 1 mission
    localStore.replaceAll({
      tasks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          user_id: 'local-anon',
          title: 'Export Test Task',
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
        },
      ],
      missions: [
        {
          id: '650e8400-e29b-41d4-a716-446655440001',
          user_id: 'local-anon',
          task_id: null,
          title: 'Export Test Mission',
          objective: null,
          next_action: null,
          planned_minutes: 25,
          status: 'planned',
          started_at: null,
          completed_at: null,
          created_at: new Date().toISOString(),
        },
      ],
      sessions: [],
    });

    const exported = await portabilityService.exportUserData();
    expect(exported.version).toBe(1);
    expect(exported.app).toBe('odyssey');
    expect(exported.summary.task_count).toBe(1);
    expect(exported.summary.mission_count).toBe(1);
    expect(exported.summary.session_count).toBe(0);
    expect(exported.data.tasks[0].title).toBe('Export Test Task');
    expect(exported.data.missions[0].title).toBe('Export Test Mission');
  });

  it('validates import strings and rejects corrupted JSON', () => {
    const corruptedResult = portabilityService.validateImport('{ bad json: ');
    expect(corruptedResult.valid).toBe(false);
    expect(corruptedResult.errors[0].message).toContain('not valid JSON');

    const validJson = JSON.stringify({
      version: 1,
      app: 'odyssey',
      data: {
        tasks: [{ title: 'Valid task' }],
        missions: [{ title: 'Valid mission', planned_minutes: 30 }],
        sessions: [],
      },
    });

    const validResult = portabilityService.validateImport(validJson);
    expect(validResult.valid).toBe(true);
    expect(validResult.data?.tasks).toHaveLength(1);
    expect(validResult.data?.missions).toHaveLength(1);
  });

  it('safely restores user data using "replace" strategy in local mode', async () => {
    // Start with 1 existing task
    localStore.replaceAll({
      tasks: [
        {
          id: '11111111-1111-4111-a111-111111111111',
          user_id: 'local-anon',
          title: 'Old Task to be replaced',
          description: null,
          status: 'todo',
          priority: 'low',
          deadline: null,
          estimated_minutes: null,
          source: null,
          source_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        },
      ],
      missions: [],
      sessions: [],
    });

    const newBackupData = {
      tasks: [
        {
          id: '22222222-2222-4222-a222-222222222222',
          user_id: 'other-user',
          title: 'Brand New Restored Task',
          description: null,
          status: 'completed' as const,
          priority: 'urgent' as const,
          deadline: null,
          estimated_minutes: 60,
          source: null,
          source_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      ],
      missions: [],
      sessions: [],
    };

    const result = await portabilityService.restoreUserData(newBackupData, 'replace');
    expect(result.success).toBe(true);
    expect(result.strategy).toBe('replace');
    expect(result.tasksImported).toBe(1);

    const currentTasks = localStore.exportAll().tasks;
    expect(currentTasks).toHaveLength(1);
    expect(currentTasks[0].title).toBe('Brand New Restored Task');
    expect(currentTasks[0].user_id).toBe('local-anon');
  });

  it('safely merges imported data with existing records', async () => {
    localStore.replaceAll({
      tasks: [
        {
          id: '11111111-1111-4111-a111-111111111111',
          user_id: 'local-anon',
          title: 'Existing Task 1',
          description: null,
          status: 'todo',
          priority: 'low',
          deadline: null,
          estimated_minutes: null,
          source: null,
          source_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        },
      ],
      missions: [],
      sessions: [],
    });

    const backupData = {
      tasks: [
        {
          id: '33333333-3333-4333-a333-333333333333',
          user_id: 'another-user',
          title: 'Merged Task 2',
          description: null,
          status: 'in_progress' as const,
          priority: 'high' as const,
          deadline: null,
          estimated_minutes: 30,
          source: null,
          source_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        },
      ],
      missions: [],
      sessions: [],
    };

    const result = await portabilityService.restoreUserData(backupData, 'merge');
    expect(result.success).toBe(true);
    expect(result.strategy).toBe('merge');

    const currentTasks = localStore.exportAll().tasks;
    expect(currentTasks).toHaveLength(2);
    expect(currentTasks.map(t => t.title)).toContain('Existing Task 1');
    expect(currentTasks.map(t => t.title)).toContain('Merged Task 2');
  });
});
