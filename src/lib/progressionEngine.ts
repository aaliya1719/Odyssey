import type { FocusSession, Mission, Task } from '../types/database';

const DAY = 86_400_000;
export const EXPEDITION_RANKS = [
  { title: 'Ground Base Cadet', xp: 0, accent: 'var(--color-app-text-muted)' },
  { title: 'Sub-Orbital Voyager', xp: 250, accent: 'var(--color-app-success)' },
  { title: 'Lunar Cartographer', xp: 750, accent: 'var(--color-app-mission)' },
  { title: 'Solar Navigator', xp: 1800, accent: 'var(--color-app-gold)' },
  { title: 'Deep Space Pioneer', xp: 3500, accent: 'var(--color-app-text)' },
] as const;
export type ProgressionOptions = { now?: number; timeZone?: string; restDays?: readonly number[]; halfLifeHours?: number };
export type ProgressionHistory = { tasks: readonly Task[]; missions: readonly Mission[]; sessions: readonly FocusSession[] };

export function resolveTimeZone(value?: string): string {
  try {
    const zone = value ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
    return zone || 'UTC';
  } catch { return 'UTC'; }
}

// Reject normalized dates such as February 30, not just unparseable strings.
function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

/** A local civil day represented on a UTC calendar, so DST cannot create 23/25-hour gaps. */
function calendarDay(time: number, formatter: Intl.DateTimeFormat): number {
  const parts = formatter.formatToParts(time);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return Date.parse(`${get('year').padStart(4, '0')}-${get('month')}-${get('day')}T00:00:00Z`) / DAY;
}
const dayLabel = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const minutes = (value: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

// Replayed/imported records have one identity. Latest dated state wins; ties are
// deterministic, so input ordering cannot grant extra XP or streak credit.
function unique<T extends { id: string }>(rows: readonly T[], date: (row: T) => string | null): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (typeof row.id !== 'string' || !row.id) continue;
    const old = map.get(row.id), time = timestamp(date(row)) ?? 0;
    if (!old || time > (timestamp(date(old)) ?? 0) || (time === (timestamp(date(old)) ?? 0) && JSON.stringify(row) > JSON.stringify(old))) map.set(row.id, row);
  }
  return [...map.values()];
}

/** Pure projection; no mutable XP, shield balance, or completion side effects. */
export function calculateProgression(history: ProgressionHistory, options: ProgressionOptions = {}) {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new RangeError('A valid current time is required.');
  const timeZone = resolveTimeZone(options.timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = calendarDay(now, formatter);
  const restDays = [...new Set((options.restDays ?? [0, 6]).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  const halfLifeHours = options.halfLifeHours && Number.isFinite(options.halfLifeHours) && options.halfLifeHours > 0 ? options.halfLifeHours : 48;
  const tasks = unique(history.tasks, row => row.updated_at).filter(row => row.status === 'completed');
  const missions = unique(history.missions, row => row.completed_at ?? row.created_at).filter(row => row.status === 'completed');
  const sessions = unique(history.sessions, row => row.ended_at ?? row.started_at);
  const focusMinutes = sessions.reduce((sum, row) => sum + minutes(row.duration_minutes), 0);
  const xp = tasks.length * 50 + missions.length * 250 + focusMinutes * 10;
  const rankIndex = EXPEDITION_RANKS.findLastIndex(rank => xp >= rank.xp), rank = EXPEDITION_RANKS[rankIndex];
  const nextRank = EXPEDITION_RANKS[rankIndex + 1] ?? null;
  const rankProgress = nextRank ? Math.min(100, (xp - rank.xp) / (nextRank.xp - rank.xp) * 100) : 100;
  const days = new Map<number, { minutes: number; missions: number; latest: number }>();
  function activity(value: string | null, focus = 0, mission = 0) {
    const time = timestamp(value);
    if (time === null || time > now) return;
    const day = calendarDay(time, formatter), old = days.get(day) ?? { minutes: 0, missions: 0, latest: time };
    days.set(day, { minutes: old.minutes + focus, missions: old.missions + mission, latest: Math.max(time, old.latest) });
  }
  tasks.forEach(row => activity(row.completed_at));
  missions.forEach(row => activity(row.completed_at, 0, 1));
  sessions.forEach(row => { if (minutes(row.duration_minutes)) activity(row.ended_at ?? row.started_at, minutes(row.duration_minutes)); });

  let streak = 0, longestStreak = 0, shields = 0, earned = 0;
  const shieldedDays: string[] = [];
  const sortedDays = [...days.keys()].sort((a, b) => a - b);
  // Rest days preserve the count; only actual activity advances it. Today's
  // unfinished day never consumes a shield or breaks an otherwise live streak.
  for (let day = sortedDays[0] ?? today; day <= today; day++) {
    if (days.has(day)) {
      streak++; longestStreak = Math.max(longestStreak, streak); earned++;
      if (earned === 7) { shields = 1; earned = 0; }
    } else if (day < today && !restDays.includes(((day + 4) % 7 + 7) % 7)) {
      if (shields) { shields = 0; shieldedDays.push(dayLabel(day)); }
      else { streak = 0; earned = 0; }
    }
  }
  const momentum = Math.min(100, [...days.values()].reduce((sum, day) => {
    // Up to 50 points for 60 focus minutes, 30 for three missions and 20 for
    // an active day. Each day's contribution halves every 48 elapsed hours.
    const depth = 50 * Math.min(1, day.minutes / 60) + 30 * Math.min(1, day.missions / 3) + 20;
    return sum + depth * 2 ** (-(now - day.latest) / (halfLifeHours * 3_600_000));
  }, 0));
  return { xp, focusMinutes, completedTasks: tasks.length, completedMissions: missions.length, rank, rankIndex, nextRank, rankProgress,
    streak, longestStreak, shields, shieldedDays, daysToShield: 7 - earned, momentum, timeZone, restDays,
    lastActiveDay: sortedDays.length ? dayLabel(sortedDays[sortedDays.length - 1]) : null };
}
export type ExpeditionProgress = ReturnType<typeof calculateProgression>;
