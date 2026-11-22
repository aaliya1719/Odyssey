import { describe, expect, it } from 'vitest';
import { dailyTargetLabel, dailyTargetProgress, todaysFocusMinutes } from './dailyFocus';

// Dates built from local components so the tests hold in any timezone.
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const s = (when: Date, duration: number | null) => ({ started_at: when.toISOString(), duration_minutes: duration });

describe('todaysFocusMinutes', () => {
  const now = local(2026, 5, 10, 15, 0);

  it('sums only sessions that started today', () => {
    const total = todaysFocusMinutes(
      [s(local(2026, 5, 10, 9), 25), s(local(2026, 5, 10, 13), 30), s(local(2026, 5, 9, 20), 60)],
      now,
    );
    expect(total).toBe(55);
  });

  it('treats the local midnight boundaries correctly', () => {
    const justAfterMidnight = s(local(2026, 5, 10, 0, 0), 10);
    const justBeforeMidnight = s(local(2026, 5, 9, 23, 59), 40);
    const tomorrow = s(local(2026, 5, 11, 0, 0), 99);
    expect(todaysFocusMinutes([justAfterMidnight, justBeforeMidnight, tomorrow], now)).toBe(10);
    // A late-evening session still counts on the evening it happened.
    expect(todaysFocusMinutes([s(local(2026, 5, 10, 23, 30), 20)], local(2026, 5, 10, 23, 45))).toBe(20);
  });

  it('skips running sessions, negative durations and bad timestamps', () => {
    expect(todaysFocusMinutes([s(local(2026, 5, 10, 8), null), s(local(2026, 5, 10, 9), -5)], now)).toBe(0);
    expect(todaysFocusMinutes([{ started_at: 'nope', duration_minutes: 30 }], now)).toBe(0);
    expect(todaysFocusMinutes([], now)).toBe(0);
  });
});

describe('dailyTargetProgress', () => {
  it('scales and clamps', () => {
    expect(dailyTargetProgress(50)).toBe(0.5);
    expect(dailyTargetProgress(250)).toBe(1);
    expect(dailyTargetProgress(0)).toBe(0);
    expect(dailyTargetProgress(10, 0)).toBe(0);
  });
});

describe('dailyTargetLabel', () => {
  it('matches the tooltip wording', () => {
    expect(dailyTargetLabel(49.6)).toBe("Today's Focus: 50 mins / 100 mins target");
  });
});
