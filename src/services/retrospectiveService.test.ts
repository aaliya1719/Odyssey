import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRetrospective } from './aiService';
import type { RetrospectiveMetrics } from '../../supabase/functions/_shared/retrospective.ts';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke } } }));
const metrics: RetrospectiveMetrics = {
  missionsConsidered: 1, missionsCompleted: 1, tasksCompleted: 0, focusSessions: 1,
  focusByWindow: [0, 40, 0, 0],
  obstacleCounts: { interruptions: 0, scope: 1, dependencies: 0, energy: 0, tools: 0 },
};
const signal = new AbortController().signal;

beforeEach(() => invoke.mockReset());
describe('weekly AI digest transport', () => {
  it('sends only aggregate data and validates the response', async () => {
    const digest = { victory: 'One mission.', friction: 'Unclear scope.', strategy: 'Plan a smaller mission.' };
    invoke.mockResolvedValue({ data: digest });
    expect(await generateRetrospective(metrics, signal)).toEqual(digest);
    expect(invoke).toHaveBeenCalledWith('suggest-mission', {
      body: { operation: 'weekly_retrospective', summary: metrics }, signal,
    });
  });

  it('rejects additional input even when a caller bypasses TypeScript', async () => {
    const withText = { ...metrics, reflection: 'Private note' };
    expect(await generateRetrospective(withText, signal)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falls back on a malformed response, missing configuration or network exception', async () => {
    invoke.mockResolvedValueOnce({ data: { victory: 'incomplete' } })
      .mockResolvedValueOnce({ error: { message: 'unavailable' } })
      .mockRejectedValueOnce(new Error('offline'));
    for (let i = 0; i < 3; i++) expect(await generateRetrospective(metrics, signal)).toBeNull();
  });
});
