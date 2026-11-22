import { describe, expect, it } from 'vitest';
import { aggregateRetrospective, localRetrospective, peakFocusWindow } from './expeditionRetrospective';
import { parseRetrospectiveDigest, parseRetrospectiveMetrics, retrospectivePrompt } from '../../supabase/functions/_shared/retrospective.ts';

const now = new Date('2026-11-22T13:00:00Z');
const start = '2026-11-16T00:00:00Z';
const completed = (date: string, reflection?: string) =>
  ({ status: 'completed' as const, created_at: '2026-11-10T00:00:00Z', completed_at: date, reflection });
const interval = (id: string, started_at: string, ended_at: string | null) => ({ id, started_at, ended_at });

describe('seven-day expedition telemetry', () => {
  it('includes carry-in completions, current-day records, and valid completed tasks only', () => {
    const { start: from, end, metrics } = aggregateRetrospective([
      completed(start, 'Interrupted; waiting for approval'),
      completed(now.toISOString(), 'Blocked by a dependency, then had low energy'),
      completed('2026-11-20T13:00:00Z'),
      completed('2026-11-15T23:59:59Z'),
      completed('2026-11-22T13:00:01Z'),
      { status: 'planned', created_at: start, completed_at: null, reflection: 'blocked' },
    ], [
      { status: 'completed', completed_at: start },
      { status: 'completed', completed_at: 'invalid' },
      { status: 'completed', completed_at: null },
      { status: 'archived', completed_at: start },
    ], [], now);
    expect(from.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(end).toEqual(now);
    expect(metrics).toMatchObject({
      missionsConsidered: 4, missionsCompleted: 3, tasksCompleted: 1,
      obstacleCounts: { interruptions: 1, scope: 0, dependencies: 2, energy: 1, tools: 0 },
    });
  });

  it('clips the left boundary, splits local time windows, and avoids overlapping or duplicate time', () => {
    const { metrics } = aggregateRetrospective([], [], [
      interval('edge', '2026-11-15T23:15:00Z', '2026-11-16T00:20:00Z'),
      interval('cross', '2026-11-18T05:30:00Z', '2026-11-18T06:40:00Z'),
      interval('overlap', '2026-11-18T06:10:00Z', '2026-11-18T07:00:00Z'),
      interval('cross', '2026-11-18T05:30:00Z', '2026-11-18T06:40:00Z'),
      interval('old', '2026-11-14T06:00:00Z', '2026-11-14T06:15:00Z'),
      interval('active', start, null),
      interval('bad', 'invalid', '2026-11-17T06:00:00Z'),
      interval('future', '2026-11-22T12:55:00Z', '2026-11-22T13:10:00Z'),
    ], now);
    expect(metrics.focusSessions).toBe(3);
    expect(metrics.focusByWindow).toEqual([50, 60, 0, 0]);
    expect(peakFocusWindow(metrics)).toBe('Morning · 06:00–12:00');
  });

  it('reports ties without inventing a narrower peak', () => {
    const { metrics } = aggregateRetrospective([], [], [], now);
    expect(peakFocusWindow(metrics)).toBe('No recorded focus window');
    expect(peakFocusWindow({ ...metrics, focusByWindow: [0, 15, 0, 15] }))
      .toBe('Morning · 06:00–12:00 and Evening · 18:00–00:00');
  });
});

describe('local fallback and shared AI schema', () => {
  const { metrics } = aggregateRetrospective(
    [completed(start, 'Private note from someone: unclear scope and a build error')], [], [], now,
  );

  it('produces a deterministic digest and reports no unsupported patterns for empty history', () => {
    const empty = aggregateRetrospective([], [], [], now).metrics;
    expect(localRetrospective(empty)).toMatchObject({
      victory: expect.stringMatching(/no completed work/),
      friction: expect.stringMatching(/No recurring obstacle/),
    });
    expect(localRetrospective(metrics)).toMatchObject({
      victory: 'You finished 1 of 1 missions in view.',
      friction: 'Most frequent debrief themes: unclear scope, tooling problems.',
    });
    expect(localRetrospective({ ...empty, tasksCompleted: 2 }).victory).toMatch(/completed 2 tasks/);
    expect(localRetrospective({ ...empty, focusByWindow: [0, 5, 0, 0] })).toMatchObject({
      victory: expect.stringMatching(/5 minutes/), strategy: expect.stringMatching(/Reserve a focus block/),
    });
  });

  it('only embeds sanitized aggregates in the prompt and rejects extra or inconsistent fields', () => {
    const prompt = retrospectivePrompt(metrics);
    expect(prompt).toContain('"scope":1');
    expect(prompt).not.toContain('Private note');
    expect(retrospectivePrompt({ ...metrics, reflection: 'personal information' })).toBeNull();
    expect(parseRetrospectiveMetrics({ ...metrics, focusByWindow: [0, 'private', 0, 0] })).toBeNull();
    expect(parseRetrospectiveMetrics({ ...metrics, missionsCompleted: 2 })).toBeNull();
    expect(parseRetrospectiveMetrics({ ...metrics, obstacleCounts: { ...metrics.obstacleCounts, scope: 2 } })).toBeNull();
    expect(parseRetrospectiveMetrics(null)).toBeNull();
  });

  it('requires exactly three short nonempty fields in the model response', () => {
    const result = { victory: '  One mission complete. ', friction: 'Scope changed.', strategy: 'Narrow the scope.' };
    expect(parseRetrospectiveDigest(result)?.victory).toBe('One mission complete.');
    expect(parseRetrospectiveDigest({ ...result, link: 'https://example.test' })).toBeNull();
    expect(parseRetrospectiveDigest({ ...result, victory: 1 })).toBeNull();
    expect(parseRetrospectiveDigest({ ...result, friction: ' ' })).toBeNull();
    expect(parseRetrospectiveDigest({ ...result, strategy: 'x'.repeat(361) })).toBeNull();
    expect(parseRetrospectiveDigest({ ...result, strategy: 'x\ny' })).toBeNull();
    expect(parseRetrospectiveDigest(['a', 'b', 'c'])).toBeNull();
  });
});
