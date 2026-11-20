import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn(),
  },
}));

import { clearLocalStore } from '../lib/localStore';
import { MAX_REFLECTION_LENGTH } from '../lib/reflection';
import { missionService } from './missionService';
import type { CreateMissionInput } from './missionService';

describe('missionService duration validation', () => {
  it.each([null, 0, -1, 1.5, 241, NaN, Infinity])
    ('rejects invalid duration %s before creating a mission', async value => {
      await expect(missionService.createMission({ title: 'Test', planned_minutes: value as number }))
        .rejects.toThrow(RangeError);
    });

  it('rejects an invalid duration update before persistence', async () => {
    await expect(missionService.updateMission('mission-id', { planned_minutes: 0 }))
      .rejects.toThrow(RangeError);
  });

  it('rejects omitted duration at runtime for older callers', async () => {
    await expect(missionService.createMission({ title: 'Test' } as CreateMissionInput))
      .rejects.toThrow(RangeError);
  });
});

describe('missionService reflection persistence (local storage)', () => {
  beforeEach(() => clearLocalStore());

  const newMission = () => missionService.createMission({ title: 'Study DS', planned_minutes: 25 });

  it('starts without a reflection', async () => {
    const mission = await newMission();
    expect(mission.reflection ?? null).toBeNull();
  });

  it('saves a trimmed reflection and reads it back', async () => {
    const mission = await newMission();
    const updated = await missionService.updateMission(mission.id, { reflection: '  Trees are just recursion.  ' });
    expect(updated.reflection).toBe('Trees are just recursion.');
    expect((await missionService.getMission(mission.id)).reflection).toBe('Trees are just recursion.');
    expect((await missionService.getMissions())[0].reflection).toBe('Trees are just recursion.');
  });

  it('caps the reflection length', async () => {
    const mission = await newMission();
    const updated = await missionService.updateMission(mission.id, { reflection: 'y'.repeat(MAX_REFLECTION_LENGTH + 500) });
    expect(updated.reflection).toHaveLength(MAX_REFLECTION_LENGTH);
  });

  it('stores a blank or null reflection as null, which is how a skipped debrief looks', async () => {
    const mission = await newMission();
    await missionService.updateMission(mission.id, { reflection: 'something' });
    expect((await missionService.updateMission(mission.id, { reflection: '   ' })).reflection).toBeNull();
    await missionService.updateMission(mission.id, { reflection: null });
    expect((await missionService.updateMission(mission.id, { reflection: null })).reflection).toBeNull();
  });

  it('leaves the reflection alone when an update does not mention it', async () => {
    const mission = await newMission();
    await missionService.updateMission(mission.id, { reflection: 'keep me' });
    const completed = await missionService.completeMission(mission.id);
    expect(completed.status).toBe('completed');
    expect(completed.reflection).toBe('keep me');
  });
});
