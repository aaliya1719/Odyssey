import { describe, expect, it } from 'vitest';
import { missionService } from './missionService';

describe('missionService duration validation', () => {
  it.each([null, 0, -1, 1.5, 241, NaN, Infinity])
    ('rejects invalid duration %s before creating a mission', async value => {
      await expect(missionService.createMission({ title: 'Test', planned_minutes: value }))
        .rejects.toThrow(RangeError);
    });

  it('rejects an invalid duration update before persistence', async () => {
    await expect(missionService.updateMission('mission-id', { planned_minutes: 0 }))
      .rejects.toThrow(RangeError);
  });
});
