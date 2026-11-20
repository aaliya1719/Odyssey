import { describe, expect, it, vi } from 'vitest';
import {
  CUES,
  SOUND_STORAGE_KEY,
  createChime,
  reachedZero,
  readSoundEnabled,
  scheduleCue,
  writeSoundEnabled,
} from './chime';
import type { AudioContextLike } from './chime';

// A recording stand-in for AudioContext, so no real audio is needed.
interface RecordedGain {
  calls: Array<[string, number, number]>;
  connectedTo: unknown[];
}

interface RecordedOscillator {
  type: string;
  frequency: { value: number };
  started: number | null;
  stopped: number | null;
  connectedTo: unknown[];
}

function fakeContext(state = 'running', currentTime = 10) {
  const oscillators: RecordedOscillator[] = [];
  const gains: RecordedGain[] = [];
  const destination = { name: 'destination' };
  const noop = () => undefined;

  const ctx = {
    currentTime,
    state,
    destination,
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    createGain() {
      const rec: RecordedGain = { calls: [], connectedTo: [] };
      gains.push(rec);
      return {
        gain: {
          value: 1,
          setValueAtTime: (v: number, t: number) => rec.calls.push(['set', v, t]),
          linearRampToValueAtTime: (v: number, t: number) => rec.calls.push(['linear', v, t]),
          exponentialRampToValueAtTime: (v: number, t: number) => rec.calls.push(['exp', v, t]),
        },
        connect: (to: unknown) => { rec.connectedTo.push(to); },
      };
    },
    createOscillator() {
      const osc = {
        type: '',
        frequency: {
          value: 0,
          setValueAtTime: noop,
          linearRampToValueAtTime: noop,
          exponentialRampToValueAtTime: noop,
        },
        started: null as number | null,
        stopped: null as number | null,
        connectedTo: [] as unknown[],
        connect(to: unknown) { osc.connectedTo.push(to); },
        start(t: number) { osc.started = t; },
        stop(t: number) { osc.stopped = t; },
      };
      oscillators.push(osc);
      return osc;
    },
  };
  return { ctx: ctx as unknown as AudioContextLike, raw: ctx, oscillators, gains, destination };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    data,
  };
}

describe('sound preference', () => {
  it('is muted by default', () => {
    expect(readSoundEnabled(memoryStorage())).toBe(false);
  });

  it('is on only when the stored value is "on"', () => {
    expect(readSoundEnabled(memoryStorage({ [SOUND_STORAGE_KEY]: 'on' }))).toBe(true);
    for (const junk of ['off', 'true', '1', '', 'ON']) {
      expect(readSoundEnabled(memoryStorage({ [SOUND_STORAGE_KEY]: junk }))).toBe(false);
    }
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    writeSoundEnabled(true, storage);
    expect(readSoundEnabled(storage)).toBe(true);
    writeSoundEnabled(false, storage);
    expect(storage.data.get(SOUND_STORAGE_KEY)).toBe('off');
    expect(readSoundEnabled(storage)).toBe(false);
  });

  it('stays muted and does not throw when storage is missing or broken', () => {
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readSoundEnabled(null)).toBe(false);
    expect(readSoundEnabled(broken)).toBe(false);
    expect(() => writeSoundEnabled(true, broken)).not.toThrow();
    expect(() => writeSoundEnabled(true, null)).not.toThrow();
  });
});

describe('cue definitions', () => {
  it('plays a two-note rising chime on completion', () => {
    const [first, second] = CUES.complete;
    expect(CUES.complete).toHaveLength(2);
    expect(second.frequency).toBeGreaterThan(first.frequency);
    expect(second.offset).toBeGreaterThan(first.offset);
  });

  it('keeps the pause/resume tick softer and shorter than the completion chime', () => {
    const peak = (cue: keyof typeof CUES) => Math.max(...CUES[cue].map(n => n.gain));
    const length = (cue: keyof typeof CUES) => Math.max(...CUES[cue].map(n => n.offset + n.duration));
    expect(peak('tick')).toBeLessThan(peak('complete'));
    expect(length('tick')).toBeLessThan(length('complete'));
  });

  it('keeps every note quiet and finite', () => {
    for (const notes of Object.values(CUES)) {
      for (const n of notes) {
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(0.25);
        expect(n.frequency).toBeGreaterThan(100);
        expect(n.duration).toBeGreaterThan(0);
        expect(n.offset).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives the time-up cue its own sound', () => {
    expect(CUES.timeUp).not.toEqual(CUES.complete);
    expect(CUES.timeUp[1].frequency).toBeLessThan(CUES.timeUp[0].frequency);
  });
});

describe('scheduleCue', () => {
  it('schedules one sine oscillator and gain envelope per note, relative to the context clock', () => {
    const { ctx, oscillators, gains, destination } = fakeContext('running', 10);
    scheduleCue(ctx, 'complete');

    expect(oscillators).toHaveLength(CUES.complete.length);
    expect(gains).toHaveLength(CUES.complete.length);
    oscillators.forEach((osc, i) => {
      const note = CUES.complete[i];
      expect(osc.type).toBe('sine');
      expect(osc.frequency.value).toBe(note.frequency);
      expect(osc.started).toBeCloseTo(10 + note.offset);
      expect(osc.stopped).toBeGreaterThan(10 + note.offset + note.duration);
      expect(osc.connectedTo).toHaveLength(1);
      expect(gains[i].connectedTo).toEqual([destination]);
    });
  });

  it('shapes each note with a silent start, a short attack to its peak and a decay to silence', () => {
    const { ctx, gains } = fakeContext('running', 0);
    scheduleCue(ctx, 'tick');
    const [set, attack, decay] = gains[0].calls;
    const note = CUES.tick[0];
    expect(set[0]).toBe('set');
    expect(set[1]).toBeLessThan(0.001);
    expect(attack[0]).toBe('linear');
    expect(attack[1]).toBe(note.gain);
    expect(attack[2]).toBeLessThan(0.05);
    expect(decay[0]).toBe('exp');
    expect(decay[1]).toBeLessThan(0.001);
    expect(decay[2]).toBeCloseTo(note.duration);
  });
});

describe('createChime', () => {
  it('does not create or touch an audio context while muted', () => {
    const createContext = vi.fn(() => fakeContext().ctx);
    const chime = createChime({ createContext, isEnabled: () => false });
    expect(chime.play('complete')).toBe(false);
    expect(chime.unlock()).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
  });

  it('creates the context lazily on first use and reuses it afterwards', () => {
    const fake = fakeContext();
    const createContext = vi.fn(() => fake.ctx);
    const chime = createChime({ createContext, isEnabled: () => true });
    expect(createContext).not.toHaveBeenCalled();

    expect(chime.play('tick')).toBe(true);
    expect(chime.play('complete')).toBe(true);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(fake.oscillators).toHaveLength(CUES.tick.length + CUES.complete.length);
  });

  it('unlock creates and resumes the context without playing anything', () => {
    const fake = fakeContext('suspended');
    const chime = createChime({ createContext: () => fake.ctx, isEnabled: () => true });
    expect(chime.unlock()).toBe(true);
    expect(fake.raw.resume).toHaveBeenCalledTimes(1);
    expect(fake.oscillators).toHaveLength(0);
  });

  it('resumes a suspended context before playing', () => {
    const fake = fakeContext('suspended');
    const chime = createChime({ createContext: () => fake.ctx, isEnabled: () => true });
    chime.play('complete');
    expect(fake.raw.resume).toHaveBeenCalledTimes(1);
  });

  it('follows the toggle: playing stops as soon as sound is switched off', () => {
    let enabled = true;
    const fake = fakeContext();
    const chime = createChime({ createContext: () => fake.ctx, isEnabled: () => enabled });
    expect(chime.play('tick')).toBe(true);
    enabled = false;
    expect(chime.play('tick')).toBe(false);
    expect(fake.oscillators).toHaveLength(CUES.tick.length);
  });

  it('returns false instead of throwing when the browser has no Web Audio', () => {
    const chime = createChime({ createContext: () => null, isEnabled: () => true });
    expect(chime.play('complete')).toBe(false);
    expect(chime.unlock()).toBe(false);
  });

  it('swallows errors from the audio context', () => {
    const chime = createChime({
      createContext: () => { throw new Error('NotAllowedError'); },
      isEnabled: () => true,
    });
    expect(() => chime.play('complete')).not.toThrow();
    expect(chime.play('complete')).toBe(false);
  });
});

describe('reachedZero', () => {
  it('fires on the tick that brings the remaining time to zero', () => {
    expect(reachedZero(1, 0)).toBe(true);
    expect(reachedZero(2, 0)).toBe(true);
  });

  it('does not fire while time is left, or once it is already at zero', () => {
    expect(reachedZero(5, 4)).toBe(false);
    expect(reachedZero(0, 0)).toBe(false);
  });

  it('does not fire when a restored timer lands on zero without counting down to it', () => {
    expect(reachedZero(null, 0)).toBe(false);
    expect(reachedZero(1500, 0)).toBe(false);
  });
});
