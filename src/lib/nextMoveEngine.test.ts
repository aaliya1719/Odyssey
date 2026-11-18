import { describe, expect, it } from 'vitest';
import type { Task } from '../types/database';
import { daysUntil, rankNextMoves, recommendNextMove } from './nextMoveEngine';

const NOW = new Date('2026-11-15T09:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

let n = 0;
const task = (over: Partial<Task>): Task =>
  ({
    id: `t${++n}`,
    user_id: 'u',
    title: `Task ${n}`,
    description: null,
    status: 'pending',
    priority: 'medium',
    tags: [],
    deadline: null,
    estimated_minutes: 30,
    source: null,
    source_id: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    completed_at: null,
    ...over,
  }) as Task;

describe('recommendNextMove', () => {
  it('returns nothing for an empty or fully completed list', () => {
    expect(recommendNextMove([], { now: NOW }).primary).toBeNull();
    const done = [task({ status: 'completed' }), task({ status: 'archived' })];
    expect(recommendNextMove(done, { now: NOW })).toEqual({ primary: null, alternatives: [] });
  });

  it('puts an overdue task first and says so', () => {
    const overdue = task({ title: 'late', deadline: inDays(-2), priority: 'low' });
    const urgent = task({ title: 'urgent', priority: 'urgent' });
    const { primary } = recommendNextMove([urgent, overdue], { now: NOW });
    expect(primary!.task.title).toBe('late');
    expect(primary!.rationale).toBe('Overdue by 2 days');
  });

  it('prefers a close deadline over a distant one at equal priority', () => {
    const soon = task({ title: 'soon', deadline: inDays(2) });
    const later = task({ title: 'later', deadline: inDays(20) });
    const { primary, alternatives } = recommendNextMove([later, soon], { now: NOW });
    expect(primary!.task.title).toBe('soon');
    expect(primary!.rationale).toBe('Highest urgency with 2 days left');
    expect(alternatives[0].task.title).toBe('later');
  });

  it('recommends a quick win when energy is low', () => {
    const big = task({ title: 'big', priority: 'high', estimated_minutes: 90 });
    const quick = task({ title: 'quick', priority: 'high', estimated_minutes: 15 });
    const { primary } = recommendNextMove([big, quick], { energy: 'low', now: NOW });
    expect(primary!.task.title).toBe('quick');
    expect(primary!.reasons).toContain('Quick win matching your low energy');
  });

  it('favours demanding work when energy is high', () => {
    const easy = task({ title: 'easy', priority: 'medium', estimated_minutes: 15 });
    const hard = task({ title: 'hard', priority: 'high', estimated_minutes: 90 });
    expect(recommendNextMove([easy, hard], { energy: 'high', now: NOW }).primary!.task.title).toBe('hard');
  });

  it('avoids a task that does not fit the available time', () => {
    const tooLong = task({ title: 'too long', priority: 'urgent', estimated_minutes: 120 });
    const fits = task({ title: 'fits', priority: 'high', estimated_minutes: 25 });
    const { primary } = recommendNextMove([tooLong, fits], { availableMinutes: 30, now: NOW });
    expect(primary!.task.title).toBe('fits');
    expect(primary!.reasons).toContain('Fits the 30 minutes you have');
  });

  it('with plenty of time and high energy, still honours priority and deadline', () => {
    const a = task({ title: 'a', priority: 'urgent', deadline: inDays(1), estimated_minutes: 120 });
    const b = task({ title: 'b', priority: 'low', estimated_minutes: 20 });
    const { primary } = recommendNextMove([b, a], { energy: 'high', availableMinutes: 480, now: NOW });
    expect(primary!.task.title).toBe('a');
  });

  it('gives a plain fallback rationale when nothing stands out', () => {
    const { primary } = recommendNextMove([task({})], { now: NOW });
    expect(primary!.rationale).toBe('Best remaining option right now');
  });

  it('returns at most three alternatives', () => {
    const many = Array.from({ length: 8 }, () => task({}));
    expect(recommendNextMove(many, { now: NOW }).alternatives).toHaveLength(3);
  });

  it('is deterministic: same input, same order, regardless of input order', () => {
    const list = [task({ priority: 'low' }), task({ priority: 'high' }), task({ priority: 'medium' }), task({})];
    const a = rankNextMoves(list, { now: NOW }).map((m) => m.task.id);
    const b = rankNextMoves([...list].reverse(), { now: NOW }).map((m) => m.task.id);
    expect(a).toEqual(b);
  });
});

describe('daysUntil', () => {
  it('handles missing, invalid and past dates', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('not a date', NOW)).toBeNull();
    expect(daysUntil(inDays(-1), NOW)).toBe(-1);
    expect(daysUntil(inDays(3), NOW)).toBe(3);
  });
});
