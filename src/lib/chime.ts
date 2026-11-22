/**
 * Audio cues for mission execution
 *
 * Short synthesized tones made with the Web Audio API, so there are no audio
 * files to ship. Sound is muted by default and only switched on by the user.
 * The AudioContext is created lazily, from a user gesture, because browsers
 * block audio that starts without one. Nothing here runs on the timer loop:
 * a cue is scheduled once, when something happens, and the audio thread plays it.
 */

export type CueName = 'complete' | 'tick' | 'timeUp' | 'restOver';

export interface CueNote {
  /** Frequency in Hz. */
  frequency: number;
  /** Seconds after the cue starts. */
  offset: number;
  /** Seconds the note rings for. */
  duration: number;
  /** Peak gain, 0 to 1. */
  gain: number;
}

// Plain sine notes (C5, E5, G5, B5) at low gain so nothing is jarring.
export const CUES: Record<CueName, CueNote[]> = {
  // celebratory: a rising two-note chime
  complete: [
    { frequency: 659.25, offset: 0, duration: 0.55, gain: 0.16 },
    { frequency: 987.77, offset: 0.16, duration: 0.9, gain: 0.16 },
  ],
  // softer and shorter, for pause and resume
  tick: [
    { frequency: 523.25, offset: 0, duration: 0.14, gain: 0.07 },
  ],
  // planned time is up: a gentle falling pair, different from the completion chime
  timeUp: [
    { frequency: 783.99, offset: 0, duration: 0.5, gain: 0.12 },
    { frequency: 523.25, offset: 0.22, duration: 0.8, gain: 0.12 },
  ],
  // a break has ended: a soft, slow pair, quieter than the time-up cue
  restOver: [
    { frequency: 587.33, offset: 0, duration: 0.7, gain: 0.08 },
    { frequency: 783.99, offset: 0.3, duration: 1.1, gain: 0.08 },
  ],
};

// ─── Preference ──────────────────────────────────────────────────────────────

export const SOUND_STORAGE_KEY = 'odyssey-sound';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Sound is off unless the user turned it on: only the stored value "on" enables it. */
export function readSoundEnabled(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(SOUND_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeSoundEnabled(enabled: boolean, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(SOUND_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // private mode or a full quota: the choice just lasts until the page closes
  }
}

// ─── Playback ────────────────────────────────────────────────────────────────

// The small slice of the Web Audio API we use, so tests can pass a fake.
interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

interface NodeLike {
  connect(destination: unknown): unknown;
}

export interface OscillatorLike extends NodeLike {
  type: string;
  frequency: ParamLike;
  start(when: number): void;
  stop(when: number): void;
}

export interface GainLike extends NodeLike {
  gain: ParamLike;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

const ATTACK = 0.02;
const SILENCE = 0.0001;
const RELEASE_PADDING = 0.05;

/** Queue a cue's notes on the audio context's clock. Each note is a sine with a quick attack and a smooth decay. */
export function scheduleCue(ctx: AudioContextLike, cue: CueName): void {
  const start = ctx.currentTime;
  for (const note of CUES[cue]) {
    const at = start + note.offset;
    const end = at + note.duration;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.frequency;
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.linearRampToValueAtTime(note.gain, at + ATTACK);
    gain.gain.exponentialRampToValueAtTime(SILENCE, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(end + RELEASE_PADDING);
  }
}

interface ChimeOptions {
  /** Builds the audio context, or returns null when the browser has none. Called at most once. */
  createContext?: () => AudioContextLike | null;
  /** Read on every cue so the Sound toggle takes effect immediately. */
  isEnabled?: () => boolean;
}

function browserContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
}

export function createChime({ createContext = browserContext, isEnabled = () => readSoundEnabled() }: ChimeOptions = {}) {
  let ctx: AudioContextLike | null = null;

  // Created on first use and then reused. While muted this never touches audio at all.
  const getContext = (): AudioContextLike | null => {
    if (!isEnabled()) return null;
    if (!ctx) ctx = createContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  };

  return {
    /**
     * Call from a click or key handler (starting a session, flipping the Sound
     * toggle) so the context exists and is running by the time a cue fires
     * without a gesture, like the planned time running out.
     */
    unlock(): boolean {
      try {
        return getContext() !== null;
      } catch {
        return false;
      }
    },

    /** Play a cue. Returns false when muted or when audio is unavailable; it never throws. */
    play(cue: CueName): boolean {
      try {
        const audio = getContext();
        if (!audio) return false;
        scheduleCue(audio, cue);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The app-wide chime, driven by the saved Sound preference. */
export const chime = createChime();

// ─── Time-up detection ───────────────────────────────────────────────────────

/**
 * True on the tick where the remaining time reaches zero. Landing on zero
 * straight away (a timer restored after the planned time already passed, or a
 * freshly loaded mission) does not count, so the cue only plays when the
 * countdown actually runs out in front of the user.
 */
export function reachedZero(previous: number | null, next: number): boolean {
  return previous !== null && previous > 0 && previous <= 2 && next === 0;
}
