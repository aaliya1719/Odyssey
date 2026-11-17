import { describe, expect, it } from 'vitest';
import type { FocusSession, Mission } from '../types/database';
import {
  DEFAULT_TIME_WINDOW,
  TIME_WINDOWS,
  TRAIL_PER_ROW,
  TRAIL_ROW_HEIGHT,
  buildWaypoints,
  emptyTrailCopy,
  filterMissionsByWindow,
  filterSessionsByWindow,
  focusByMission,
  formatMinutes,
  layoutTrail,
  pathThrough,
  timeWindowLabel,
  windowStart,
} from './expeditionTrail';

function mission(id: string, over: Partial<Mission> = {}): Mission {
  return {
    id,
    user_id: 'u1',
    task_id: null,
    title: `Mission ${id}`,
    objective: null,
    next_action: null,
    planned_minutes: 25,
    status: 'completed',
    started_at: null,
    completed_at: '2026-01-10T10:00:00.000Z',
    created_at: '2026-01-01T10:00:00.000Z',
    ...over,
  };
}

function session(id: string, missionId: string | null, minutes: number | null, completed = true): FocusSession {
  return {
    id,
    user_id: 'u1',
    mission_id: missionId,
    started_at: '2026-01-10T09:00:00.000Z',
    ended_at: null,
    duration_minutes: minutes,
    completed,
    created_at: '2026-01-10T09:00:00.000Z',
  };
}

describe('focusByMission', () => {
  it('sums duration_minutes per mission and ignores sessions without a mission', () => {
    const totals = focusByMission([
      session('s1', 'a', 25),
      session('s2', 'a', 30),
      session('s3', 'b', 10),
      session('s4', null, 99),
    ]);
    expect(totals.get('a')).toEqual({ minutes: 55, sessions: 2 });
    expect(totals.get('b')).toEqual({ minutes: 10, sessions: 1 });
    expect(totals.size).toBe(2);
  });

  it('treats missing, negative and non-finite durations as zero minutes', () => {
    const totals = focusByMission([session('s1', 'a', null), session('s2', 'a', -5), session('s3', 'a', NaN), session('s4', 'a', 20)]);
    expect(totals.get('a')).toEqual({ minutes: 20, sessions: 4 });
  });

  it('only counts completed sessions in the session total but still adds their minutes', () => {
    const totals = focusByMission([session('s1', 'a', 25), session('s2', 'a', 10, false), session('s3', 'a', 5, false)]);
    expect(totals.get('a')).toEqual({ minutes: 40, sessions: 1 });
  });
});

describe('buildWaypoints', () => {
  it('only uses completed missions and sorts them by completed_at, oldest first', () => {
    const wps = buildWaypoints(
      [
        mission('late', { completed_at: '2026-03-01T00:00:00.000Z' }),
        mission('active', { status: 'active', completed_at: null }),
        mission('early', { completed_at: '2026-01-05T00:00:00.000Z' }),
        mission('abandoned', { status: 'abandoned' }),
        mission('mid', { completed_at: '2026-02-01T00:00:00.000Z' }),
      ],
      [],
    );
    expect(wps.map(w => w.mission.id)).toEqual(['early', 'mid', 'late']);
    expect(wps.map(w => w.index)).toEqual([1, 2, 3]);
  });

  it('attaches focus minutes and session counts from matching mission_id', () => {
    const wps = buildWaypoints(
      [mission('a'), mission('b', { completed_at: '2026-01-11T00:00:00.000Z' })],
      [session('s1', 'a', 25), session('s2', 'a', 20), session('s3', 'other', 40)],
    );
    expect(wps[0]).toMatchObject({ focusMinutes: 45, sessionCount: 2 });
    expect(wps[1]).toMatchObject({ focusMinutes: 0, sessionCount: 0 });
  });

  it('keeps a completed mission with no completed_at, sorted by created_at', () => {
    const wps = buildWaypoints(
      [
        mission('dated', { completed_at: '2026-01-10T00:00:00.000Z' }),
        mission('undated', { completed_at: null, created_at: '2026-01-02T00:00:00.000Z' }),
      ],
      [],
    );
    expect(wps.map(w => w.mission.id)).toEqual(['undated', 'dated']);
    expect(wps[0].completedAt).toBeNull();
  });

  it('returns nothing when there are no completed missions', () => {
    expect(buildWaypoints([mission('a', { status: 'planned', completed_at: null })], [])).toEqual([]);
  });
});

describe('layoutTrail', () => {
  it('puts one point per stop and one segment between each pair', () => {
    const layout = layoutTrail(7);
    expect(layout.points).toHaveLength(7);
    expect(layout.segments).toHaveLength(6);
  });

  it('grows taller by one row for every full row of stops', () => {
    const one = layoutTrail(TRAIL_PER_ROW);
    const two = layoutTrail(TRAIL_PER_ROW + 1);
    const three = layoutTrail(TRAIL_PER_ROW * 2 + 1);
    expect(two.height - one.height).toBe(TRAIL_ROW_HEIGHT);
    expect(three.height - two.height).toBe(TRAIL_ROW_HEIGHT);
  });

  it('snakes: the second row runs right to left and starts under the end of the first', () => {
    const { points } = layoutTrail(TRAIL_PER_ROW * 2);
    const firstRow = points.slice(0, TRAIL_PER_ROW);
    const secondRow = points.slice(TRAIL_PER_ROW);
    expect(firstRow.map(p => p.x)).toEqual([...firstRow.map(p => p.x)].sort((a, b) => a - b));
    expect(secondRow.map(p => p.x)).toEqual([...secondRow.map(p => p.x)].sort((a, b) => b - a));
    expect(secondRow[0].x).toBe(firstRow[TRAIL_PER_ROW - 1].x);
  });

  it('builds path data for a range of segments and nothing for an empty range', () => {
    const layout = layoutTrail(4);
    const d = pathThrough(layout, 0, 2);
    expect(d.startsWith(`M ${layout.points[0].x} ${layout.points[0].y} C`)).toBe(true);
    expect(d.match(/C /g)).toHaveLength(2);
    expect(pathThrough(layout, 0, 0)).toBe('');
  });
});

describe('formatMinutes', () => {
  it.each([[0, '0m'], [45, '45m'], [60, '1h'], [75, '1h 15m']])('formats %i as %s', (mins, out) => {
    expect(formatMinutes(mins)).toBe(out);
  });
});

// Local-time "now" so the Today cases do not depend on the machine's time zone.
const NOW = new Date(2026, 5, 15, 14, 30, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const ids = (ms: Mission[]) => ms.map(m => m.id);

describe('time windows', () => {
  it('lists the seven horizons in order and defaults to 7 Days', () => {
    expect(TIME_WINDOWS.map(w => w.label)).toEqual(['Today', '7 Days', '30 Days', '3 Months', '6 Months', '1 Year', 'All Time']);
    expect(DEFAULT_TIME_WINDOW).toBe('7d');
    expect(timeWindowLabel('90d')).toBe('3 Months');
  });

  it('starts Today at local midnight and rolling windows N x 24h back', () => {
    expect(windowStart('today', NOW)).toBe(new Date(2026, 5, 15, 0, 0, 0, 0).getTime());
    expect(windowStart('7d', NOW)).toBe(NOW - 7 * DAY);
    expect(windowStart('30d', NOW)).toBe(NOW - 30 * DAY);
    expect(windowStart('90d', NOW)).toBe(NOW - 90 * DAY);
    expect(windowStart('180d', NOW)).toBe(NOW - 180 * DAY);
    expect(windowStart('365d', NOW)).toBe(NOW - 365 * DAY);
    expect(windowStart('all', NOW)).toBeNull();
  });
});

describe('filterMissionsByWindow', () => {
  const midnight = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();

  it('Today keeps midnight itself and drops the millisecond before it', () => {
    const list = [
      mission('at-midnight', { completed_at: iso(midnight) }),
      mission('before', { completed_at: iso(midnight - 1) }),
      mission('now', { completed_at: iso(NOW) }),
    ];
    expect(ids(filterMissionsByWindow(list, 'today', NOW))).toEqual(['at-midnight', 'now']);
  });

  it('7 Days keeps exactly 7 days ago and drops anything older', () => {
    const list = [
      mission('edge', { completed_at: iso(NOW - 7 * DAY) }),
      mission('just-out', { completed_at: iso(NOW - 7 * DAY - 1) }),
      mission('recent', { completed_at: iso(NOW - 2 * DAY) }),
    ];
    expect(ids(filterMissionsByWindow(list, '7d', NOW))).toEqual(['edge', 'recent']);
  });

  it('wider windows include progressively older missions', () => {
    const list = [
      mission('d3', { completed_at: iso(NOW - 3 * DAY) }),
      mission('d20', { completed_at: iso(NOW - 20 * DAY) }),
      mission('d60', { completed_at: iso(NOW - 60 * DAY) }),
      mission('d120', { completed_at: iso(NOW - 120 * DAY) }),
      mission('d300', { completed_at: iso(NOW - 300 * DAY) }),
      mission('d500', { completed_at: iso(NOW - 500 * DAY) }),
    ];
    expect(ids(filterMissionsByWindow(list, '7d', NOW))).toEqual(['d3']);
    expect(ids(filterMissionsByWindow(list, '30d', NOW))).toEqual(['d3', 'd20']);
    expect(ids(filterMissionsByWindow(list, '90d', NOW))).toEqual(['d3', 'd20', 'd60']);
    expect(ids(filterMissionsByWindow(list, '180d', NOW))).toEqual(['d3', 'd20', 'd60', 'd120']);
    expect(ids(filterMissionsByWindow(list, '365d', NOW))).toEqual(['d3', 'd20', 'd60', 'd120', 'd300']);
    expect(filterMissionsByWindow(list, 'all', NOW)).toHaveLength(6);
  });

  it('drops missions with no usable completed_at from bounded windows but keeps them in All Time', () => {
    const list = [
      mission('none', { completed_at: null }),
      mission('garbage', { completed_at: 'not a date' }),
      mission('ok', { completed_at: iso(NOW - DAY) }),
    ];
    expect(ids(filterMissionsByWindow(list, '7d', NOW))).toEqual(['ok']);
    expect(ids(filterMissionsByWindow(list, '365d', NOW))).toEqual(['ok']);
    expect(ids(filterMissionsByWindow(list, 'all', NOW))).toEqual(['none', 'garbage', 'ok']);
  });

  it('returns an empty list for an empty input', () => {
    expect(filterMissionsByWindow([], 'today', NOW)).toEqual([]);
  });

  it('feeds buildWaypoints so the trail renumbers inside the window', () => {
    const list = [
      mission('old', { completed_at: iso(NOW - 40 * DAY) }),
      mission('new1', { completed_at: iso(NOW - 3 * DAY) }),
      mission('new2', { completed_at: iso(NOW - DAY) }),
    ];
    const wps = buildWaypoints(filterMissionsByWindow(list, '7d', NOW), []);
    expect(wps.map(w => [w.mission.id, w.index])).toEqual([['new1', 1], ['new2', 2]]);
  });
});

describe('filterSessionsByWindow', () => {
  it('filters by started_at and keeps unfinished sessions in range', () => {
    const inside = { ...session('in', 'a', 25), started_at: iso(NOW - DAY) };
    const partial = { ...session('partial', 'a', 5, false), started_at: iso(NOW - 2 * DAY) };
    const outside = { ...session('out', 'a', 40), started_at: iso(NOW - 8 * DAY) };
    const edge = { ...session('edge', 'a', 10), started_at: iso(NOW - 7 * DAY) };
    const kept = filterSessionsByWindow([inside, partial, outside, edge], '7d', NOW);
    expect(kept.map(s => s.id)).toEqual(['in', 'partial', 'edge']);
    expect(filterSessionsByWindow([inside, outside], 'all', NOW)).toHaveLength(2);
  });

  it('drops a session with an unreadable started_at from a bounded window', () => {
    const bad = { ...session('bad', 'a', 25), started_at: 'nope' };
    expect(filterSessionsByWindow([bad], '30d', NOW)).toEqual([]);
    expect(filterSessionsByWindow([bad], 'all', NOW)).toHaveLength(1);
  });
});

describe('emptyTrailCopy', () => {
  it('keeps the Base Camp copy when nothing was ever completed', () => {
    expect(emptyTrailCopy('7d', false).title).toBe('You are at Base Camp');
    expect(emptyTrailCopy('all', true).title).toBe('You are at Base Camp');
  });

  it('uses the window copy when older missions exist outside the window', () => {
    const copy = emptyTrailCopy('7d', true);
    expect(copy.title).toBe('No missions charted in this window');
    expect(copy.body).toContain('in the last 7 days');
    expect(emptyTrailCopy('today', true).body).toContain('mission today');
  });
});

describe('layoutTrail with very few waypoints', () => {
  it('lays out Base Camp and the next marker when the window has no waypoints', () => {
    const layout = layoutTrail(0 + 2);
    expect(layout.points).toHaveLength(2);
    expect(layout.segments).toHaveLength(1);
    expect(layout.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(pathThrough(layout, 0, 0)).toBe('');
    expect(pathThrough(layout, 0, layout.segments.length)).toMatch(/^M \d+ \d+ C /);
  });

  it('lays out a single waypoint with a walked path of one segment', () => {
    const layout = layoutTrail(1 + 2);
    expect(layout.points).toHaveLength(3);
    expect(pathThrough(layout, 0, 1).match(/C /g)).toHaveLength(1);
  });
});
