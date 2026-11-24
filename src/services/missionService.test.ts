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
import { supabase } from '../lib/supabase';
import { localMissions } from '../lib/localStore';
import type { CreateMissionInput, UpdateMissionInput } from './missionService';

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


describe('waypoint debrief and sentiment updates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null }, error: null } as never);
    vi.mocked(supabase.from).mockReset();
    clearLocalStore();
  });

  it.each(['flow', 'focused', 'climb', 'fatigued'] as const)('persists %s with the edited note locally', async sentiment => {
    const mission = await missionService.createMission({ title: 'Waypoint', planned_minutes: 25 });
    await missionService.completeMission(mission.id);
    const updated = await missionService.updateMission(mission.id, { reflection: '  corrected note  ', sentiment });
    expect(updated).toMatchObject({ reflection: 'corrected note', sentiment, status: 'completed' });
    expect(await missionService.getMission(mission.id)).toEqual(updated);
  });

  it.each(['energized', '', 'Flow', 1, {}, ['flow']])('rejects invalid sentiment %j before either storage path', async sentiment => {
    const getUser = vi.mocked(supabase.auth.getUser);
    getUser.mockClear();
    const update = vi.spyOn(localMissions, 'update');
    await expect(missionService.updateMission('id', { sentiment } as UpdateMissionInput)).rejects.toThrow(RangeError);
    expect(getUser).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('allows clearing a tag and retains it during unrelated updates', async () => {
    const mission = await missionService.createMission({ title: 'Waypoint', planned_minutes: 25 });
    await missionService.updateMission(mission.id, { sentiment: 'flow' });
    expect((await missionService.updateMission(mission.id, { title: 'Renamed' })).sentiment).toBe('flow');
    expect((await missionService.updateMission(mission.id, { sentiment: null })).sentiment).toBeNull();
  });

  it('leaves stored debrief unchanged when local persistence fails', async () => {
    const mission = await missionService.createMission({ title: 'Waypoint', planned_minutes: 25 });
    await missionService.updateMission(mission.id, { reflection: 'original', sentiment: 'climb' });
    vi.spyOn(localMissions, 'update').mockImplementationOnce(() => { throw new Error('Storage quota exceeded'); });
    await expect(missionService.updateMission(mission.id, { reflection: 'new', sentiment: 'flow' })).rejects.toThrow('Storage quota');
    expect(await missionService.getMission(mission.id)).toMatchObject({ reflection: 'original', sentiment: 'climb' });
  });

  function cloudUpdate(error: Error | null = null) {
    const result = { id: 'owned-mission', reflection: 'corrected', sentiment: 'focused' };
    const single = vi.fn().mockResolvedValue({ data: error ? null : result, error });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'owner' } }, error: null } as never);
    vi.mocked(supabase.from).mockReturnValue({ update } as never);
    return { update, eq, result };
  }

  it('sends the normalized note and valid tag together to Supabase', async () => {
    const { update, eq, result } = cloudUpdate();
    const updates = { reflection: ' corrected ', sentiment: 'focused' as const };
    expect(await missionService.updateMission('owned-mission', updates)).toEqual(result);
    expect(supabase.from).toHaveBeenCalledWith('missions');
    expect(update).toHaveBeenCalledWith({ reflection: 'corrected', sentiment: 'focused' });
    expect(eq).toHaveBeenCalledWith('id', 'owned-mission');
    expect(updates.reflection).toBe(' corrected ');
  });

  it('caps notes and clears the cloud tag with null', async () => {
    const { update } = cloudUpdate();
    await missionService.updateMission('owned-mission', { reflection: 'x'.repeat(1100), sentiment: null });
    expect(update).toHaveBeenCalledWith({ reflection: 'x'.repeat(1000), sentiment: null });
  });

  it('propagates a cloud failure without silently writing to guest storage', async () => {
    cloudUpdate(new Error('column sentiment does not exist'));
    const localUpdate = vi.spyOn(localMissions, 'update');
    await expect(missionService.updateMission('owned-mission', { reflection: 'new', sentiment: 'flow' })).rejects.toThrow('column sentiment');
    expect(localUpdate).not.toHaveBeenCalled();
  });
});
