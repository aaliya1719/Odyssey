import { afterAll, describe, expect, it } from 'vitest';
import { localEndOfDayIso } from './localDate';
import { daysUntil } from './nextMoveEngine';

// Node's process is not in the app's tsconfig types; only the TZ switch is needed here.
declare const process: { env: Record<string, string | undefined> };

const originalTz = process.env.TZ;
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe.each(['America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'UTC'])('localEndOfDayIso in %s', (tz) => {
  it('keeps the picked calendar day and ends it at 23:59 local', () => {
    process.env.TZ = tz;
    const iso = localEndOfDayIso('2026-11-20');
    expect(iso).toBeDefined();
    const d = new Date(iso!);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 20, 23, 59]);
  });

  it('is still due today (not overdue) at 10:00 local on the due date', () => {
    process.env.TZ = tz;
    const iso = localEndOfDayIso('2026-11-20')!;
    const now = new Date(2026, 10, 20, 10, 0);
    expect(daysUntil(iso, now)).toBe(0);
  });

  it('is due tomorrow at 10:00 local the day before', () => {
    process.env.TZ = tz;
    const iso = localEndOfDayIso('2026-11-20')!;
    const now = new Date(2026, 10, 19, 10, 0);
    expect(daysUntil(iso, now)).toBe(1);
  });
});

describe('localEndOfDayIso input handling', () => {
  it('returns undefined for empty or invalid values', () => {
    expect(localEndOfDayIso('')).toBeUndefined();
    expect(localEndOfDayIso('not a date')).toBeUndefined();
    expect(localEndOfDayIso('2026-02-30')).toBeUndefined();
    expect(localEndOfDayIso('2026-13-01')).toBeUndefined();
  });

  it('handles month and year boundaries', () => {
    process.env.TZ = 'America/New_York';
    const d = new Date(localEndOfDayIso('2026-12-31')!);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 12, 31]);
  });
});
