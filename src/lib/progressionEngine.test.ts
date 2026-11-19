import { describe, expect, it } from 'vitest';
import { calculateProgression, EXPEDITION_RANKS, resolveTimeZone } from './progressionEngine';
import { expeditionCardSvg, RANK_PATHS } from './expeditionCard';
import type { Task, Mission, FocusSession } from '../types/database';
const at = (day: string) => `${day}T12:00:00Z`;
const task = (id: string, date: string | null, changes: Partial<Task> = {}): Task => ({ id, user_id: 'local', title: 'Private task', tags: [], description: null, status: 'completed', priority: 'medium', deadline: null, estimated_minutes: null, source: null, source_id: null, created_at: date ?? at('2024-01-01'), updated_at: date ?? at('2024-01-01'), completed_at: date, ...changes });
const mission = (id: string, date: string): Mission => ({ id, user_id: 'local', task_id: null, title: 'Private mission', objective: null, next_action: null, planned_minutes: 30, status: 'completed', started_at: date, completed_at: date, created_at: date });
const session = (id: string, date: string, duration = 30): FocusSession => ({ id, user_id: 'local', mission_id: null, started_at: date, ended_at: date, duration_minutes: duration, completed: true, created_at: date });
const history = (dates: string[]) => ({ tasks: dates.map((day, i) => task(String(i), at(day))), missions: [], sessions: [] });
const run = (days: string[], now: string, restDays: number[] = []) => calculateProgression(history(days), { now: Date.parse(at(now)), timeZone: 'UTC', restDays });
const week = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'];

describe('expedition XP, ranks and identity', () => {
  it('preserves the agreed XP formula, including logged partial focus minutes', () => {
    const data = { tasks: [task('t', null)], missions: [mission('m', at('2024-01-01'))], sessions: [{ ...session('s', at('2024-01-01'), 12.5), completed: false }] };
    expect(calculateProgression(data).xp).toBe(425);
  });
  it('deduplicates replays and uses the latest record without mutating history', () => {
    const old = task('t', at('2024-01-01')), updated = { ...old, updated_at: at('2024-01-02'), status: 'todo' as const };
    const data = { tasks: [old, updated, old], missions: [mission('m', at('2024-01-01')), mission('m', at('2024-01-01'))], sessions: [session('s', at('2024-01-01'), 10), session('s', at('2024-01-02'), 20)] };
    const serialized = JSON.stringify(data), options = { now: Date.parse(at('2024-01-02')) }, result = calculateProgression(data, options);
    expect(result.xp).toBe(450); expect(result.completedTasks).toBe(0);
    expect(calculateProgression({ tasks: [...data.tasks].reverse(), missions: [...data.missions].reverse(), sessions: [...data.sessions].reverse() }, options)).toEqual(result);
    expect(JSON.stringify(data)).toBe(serialized);
  });
  it('ignores invalid focus amounts and records without identities', () => {
    const data = { tasks: [task('', null)], missions: [], sessions: [NaN, Infinity, -1, 0].map((value, i) => session(String(i), at('2024-01-01'), value)) };
    expect(calculateProgression(data).xp).toBe(0); expect(calculateProgression(data).momentum).toBe(0);
  });
  it.each([0, 249, 250, 749, 750, 1799, 1800, 3499, 3500, 5000])('uses exact half-open rank bands at %i XP', xp => {
    const result = calculateProgression({ tasks: [], missions: [], sessions: [session('s', at('2024-01-01'), xp / 10)] });
    expect(result.rank).toEqual([...EXPEDITION_RANKS].reverse().find(rank => xp >= rank.xp));
    expect(result.rankProgress).toBeGreaterThanOrEqual(0); expect(result.rankProgress).toBeLessThanOrEqual(100);
    if (xp >= 3500) { expect(result.nextRank).toBeNull(); expect(result.rankProgress).toBe(100); }
  });
});

describe('civil-day consistency and earned shields', () => {
  it('does not grant a shield before seven active days', () => {
    expect(run(week.slice(0, 6), '2024-01-06')).toMatchObject({ streak: 6, shields: 0, daysToShield: 1 });
    expect(run(week, '2024-01-07')).toMatchObject({ streak: 7, shields: 1, daysToShield: 7 });
  });
  it('consumes one shield for a closed missed day, then resets on the next miss', () => {
    expect(run(week, '2024-01-09')).toMatchObject({ streak: 7, shields: 0, shieldedDays: ['2024-01-08'] });
    expect(run(week, '2024-01-10')).toMatchObject({ streak: 0, longestStreak: 7, shields: 0 });
  });
  it('preserves the shield through configured rest days without adding streak credit', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08', '2024-01-09'];
    const result = run(dates, '2024-01-15', [0, 3, 4, 5, 6]);
    expect(result).toMatchObject({ streak: 7, shields: 1, shieldedDays: [] });
    expect(run(['2024-01-05', '2024-01-08'], '2024-01-08', [0, 6]).streak).toBe(2);
  });
  it('today remains open until midnight and never consumes its shield prematurely', () => {
    expect(run(week, '2024-01-08')).toMatchObject({ streak: 7, shields: 1, shieldedDays: [] });
    expect(run(['2024-01-01'], '2024-01-02').streak).toBe(1);
    expect(run(['2024-01-01'], '2024-01-03').streak).toBe(0);
  });
  it('replenishes at the next seven active days and caps inventory at one', () => {
    const days = [...week, ...['09', '10', '11', '12', '13', '14', '15'].map(day => `2024-01-${day}`)];
    expect(run(days, '2024-01-15')).toMatchObject({ streak: 14, shields: 1, shieldedDays: ['2024-01-08'] });
    expect(run([...week, ...['08', '09', '10', '11', '12', '13', '14'].map(day => `2024-01-${day}`)], '2024-01-14').shields).toBe(1);
  });
  it('handles leap days and rejects impossible dates, missing dates and future activity', () => {
    expect(run(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01').streak).toBe(3);
    const data = history(['2023-02-29', '2024-02-30', '2024-04-31', '2025-01-01']); data.tasks.push(task('undated', null));
    expect(calculateProgression(data, { now: Date.parse(at('2024-05-01')) })).toMatchObject({ streak: 0, momentum: 0, lastActiveDay: null, xp: 250 });
    expect(calculateProgression({ tasks: [task('ambiguous', '2024-01-01T12:00:00')], missions: [], sessions: [] }).lastActiveDay).toBeNull();
    expect(run(['1900-02-28', '1900-03-01'], '1900-03-01').streak).toBe(2);
  });
  it('uses the selected timezone for rollovers rather than UTC or a fixed offset', () => {
    const data = { tasks: [task('a', '2024-01-01T23:30:00Z'), task('b', '2024-01-02T01:30:00Z')], missions: [], sessions: [] };
    const options = { now: Date.parse('2024-01-02T02:00:00Z'), restDays: [] };
    expect(calculateProgression(data, { ...options, timeZone: 'UTC' }).streak).toBe(2);
    expect(calculateProgression(data, { ...options, timeZone: 'America/New_York' }).streak).toBe(1);
    expect(calculateProgression(data, { ...options, timeZone: 'Asia/Kolkata' }).lastActiveDay).toBe('2024-01-02');
  });
  it.each([['2024-03-09T17:00:00Z', '2024-03-10T16:00:00Z', '2024-03-11T16:00:00Z'], ['2024-11-02T16:00:00Z', '2024-11-03T17:00:00Z', '2024-11-04T17:00:00Z']])('preserves continuity across a DST boundary', (a, b, c) => {
    const result = calculateProgression({ tasks: [task('a', a), task('b', b), task('c', c)], missions: [], sessions: [] }, { now: Date.parse(c), restDays: [], timeZone: 'America/New_York' });
    expect(result.streak).toBe(3);
  });
  it('uses weekend defaults and falls back safely for invalid timezone and rest inputs', () => {
    expect(resolveTimeZone('not/a-zone')).toBe('UTC');
    expect(calculateProgression(history([])).restDays).toEqual([0, 6]);
    expect(calculateProgression(history([]), { restDays: [6, 6, -1, 7, NaN, 0], timeZone: 'invalid' })).toMatchObject({ restDays: [0, 6], timeZone: 'UTC', streak: 0, shields: 0, momentum: 0 });
    expect(() => calculateProgression(history([]), { now: NaN })).toThrow(RangeError);
  });
});

describe('momentum and local share cards', () => {
  it('combines focus depth and missions, decays by exact elapsed half-lives, and stays bounded', () => {
    const time = at('2024-01-01'), data = { tasks: [], missions: [1, 2, 3].map(i => mission(String(i), time)), sessions: [session('s', time, 60)] };
    const start = Date.parse(time);
    expect(calculateProgression(data, { now: start }).momentum).toBe(100);
    expect(calculateProgression(data, { now: start + 48 * 3_600_000 }).momentum).toBeCloseTo(50);
    expect(calculateProgression(data, { now: start + 96 * 3_600_000 }).momentum).toBeCloseTo(25);
    expect(calculateProgression(data, { now: start + 24 * 3_600_000, halfLifeHours: 24 }).momentum).toBeCloseTo(50);
    expect(calculateProgression({ ...data, missions: [...data.missions, mission('extra', time)] }, { now: start }).momentum).toBe(100);
  });
  it('gives logged focus and completed tasks activity credit, but not an empty open session', () => {
    expect(calculateProgression({ tasks: [task('t', at('2024-01-01'))], missions: [], sessions: [] }, { now: Date.parse(at('2024-01-01')) }).momentum).toBe(20);
    expect(calculateProgression({ tasks: [], missions: [], sessions: [session('s', at('2024-01-01'), 0)] }).lastActiveDay).toBeNull();
  });
  it('exports an escaped, bounded standalone SVG without private history or external resources', () => {
    const progress = calculateProgression(history(['2024-01-01'])), card = expeditionCardSvg(progress, '<script>&"\'😀');
    expect(card).toContain('&lt;script&gt;&amp;&quot;&apos;😀'); expect(card).not.toContain('<script>');
    expect(card).not.toContain('Private task'); expect(card).not.toContain('<image'); expect(card).not.toContain('foreignObject');
    expect(new Set(RANK_PATHS).size).toBe(5);
    expect(expeditionCardSvg(progress, '')).toContain('Explorer');
    expect(expeditionCardSvg(progress, 'W'.repeat(1000))).toContain('W'.repeat(24));
    expect(expeditionCardSvg(progress, 'W'.repeat(1000))).not.toContain('W'.repeat(25));
  });
});
