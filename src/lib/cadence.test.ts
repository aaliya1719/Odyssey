import { describe, expect, it } from 'vitest';
import {
  CADENCE_PRESETS,
  CADENCE_STORAGE_KEY,
  advanceRest,
  getPreset,
  readCadence,
  restProgress,
  restRemainingSeconds,
  startRest,
  writeCadence,
} from './cadence';
import { CUES } from './chime';

function memStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [[CADENCE_STORAGE_KEY, initial]] : []);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('presets', () => {
  it('matches the agreed focus/break pairs', () => {
    const pairs = Object.fromEntries(CADENCE_PRESETS.map(p => [p.id, [p.focusMinutes, p.breakMinutes]]));
    expect(pairs).toEqual({
      classic: [25, 5],
      extended: [50, 10],
      ultradian: [90, 20],
      custom: [null, 5],
    });
  });
  it('falls back to custom for an unknown id', () => {
    expect(getPreset('nope' as never).id).toBe('custom');
  });
});

describe('persistence', () => {
  it('round-trips a saved cadence', () => {
    const s = memStorage();
    writeCadence('ultradian', s);
    expect(readCadence(s)).toBe('ultradian');
  });
  it('ignores junk and survives broken storage', () => {
    expect(readCadence(memStorage('banana'))).toBe('custom');
    expect(readCadence(null)).toBe('custom');
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readCadence(throwing)).toBe('custom');
    expect(() => writeCadence('classic', throwing)).not.toThrow();
  });
});

describe('rest countdown', () => {
  const t0 = 1_000_000;

  it('starts with the full break and counts down', () => {
    const rest = startRest(5, t0);
    expect(rest).toMatchObject({ phase: 'resting', totalSeconds: 300 });
    expect(restRemainingSeconds(rest, t0)).toBe(300);
    expect(restRemainingSeconds(rest, t0 + 61_000)).toBe(239);
    expect(restRemainingSeconds(rest, t0 + 299_500)).toBe(1);
  });

  it('flips to done exactly when the end time passes', () => {
    const rest = startRest(5, t0);
    expect(advanceRest(rest, t0 + 299_999)).toBe(rest);
    expect(advanceRest(rest, t0 + 300_000)).toEqual({ phase: 'done' });
    expect(restRemainingSeconds({ phase: 'done' }, t0 + 999_999)).toBe(0);
  });

  it('leaves idle and done states alone', () => {
    expect(advanceRest({ phase: 'idle' }, t0)).toEqual({ phase: 'idle' });
    expect(advanceRest({ phase: 'done' }, t0)).toEqual({ phase: 'done' });
  });

  it('reports progress from 0 to 1', () => {
    const rest = startRest(10, t0);
    expect(restProgress(rest, t0)).toBe(0);
    expect(restProgress(rest, t0 + 300_000)).toBeCloseTo(0.5);
    expect(restProgress({ phase: 'done' }, t0)).toBe(1);
    expect(restProgress({ phase: 'idle' }, t0)).toBe(0);
  });

  it('uses 5 minutes when given a nonsense break length', () => {
    expect(startRest(0, t0)).toMatchObject({ totalSeconds: 300 });
    expect(startRest(Number.NaN, t0)).toMatchObject({ totalSeconds: 300 });
  });
});

describe('rest chime', () => {
  it('is a soft falling pair, quieter than the time-up cue', () => {
    const rest = CUES.restOver;
    expect(rest).toHaveLength(2);
    expect(Math.max(...rest.map(n => n.gain))).toBeLessThan(Math.max(...CUES.timeUp.map(n => n.gain)));
  });
});
