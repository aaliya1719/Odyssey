import type { FocusSession } from '../types/database';

export const DEFAULT_DAILY_TARGET_MINUTES = 100;

/** Start of the local calendar day containing `now`, as epoch ms. */
function startOfLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Minutes of focus that started on today's local calendar day.
 * "Today" is the viewer's local day, not UTC, so a session at 23:30 local
 * counts for that evening even when the UTC date has already rolled over.
 * Sessions with no duration yet (still running) and bad timestamps are skipped.
 */
export function todaysFocusMinutes(
  sessions: Pick<FocusSession, 'started_at' | 'duration_minutes'>[],
  now: Date = new Date(),
): number {
  const dayStart = startOfLocalDay(now);
  const nextDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  let total = 0;
  for (const s of sessions) {
    const started = new Date(s.started_at).getTime();
    if (Number.isNaN(started) || started < dayStart || started >= nextDayStart) continue;
    const minutes = s.duration_minutes ?? 0;
    if (minutes > 0) total += minutes;
  }
  return total;
}

/** 0 to 1, clamped. A non-positive target counts as no progress rather than dividing by zero. */
export function dailyTargetProgress(minutes: number, target: number = DEFAULT_DAILY_TARGET_MINUTES): number {
  if (!(target > 0) || !(minutes > 0)) return 0;
  return Math.min(1, minutes / target);
}

export function dailyTargetLabel(minutes: number, target: number = DEFAULT_DAILY_TARGET_MINUTES): string {
  return `Today's Focus: ${Math.round(minutes)} mins / ${target} mins target`;
}
