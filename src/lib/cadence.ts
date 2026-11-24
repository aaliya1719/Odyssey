/**
 * Focus cadence presets (focus length + rest length) and the rest-interval countdown.
 * Pure functions only: the countdown works from an end timestamp and a `now` argument,
 * so nothing here needs timers, React or the DOM to be tested.
 */

export type CadenceId = 'classic' | 'extended' | 'ultradian' | 'custom';

export interface CadencePreset {
  id: CadenceId;
  label: string;
  /** Focus length in minutes; null means "keep whatever the mission already has". */
  focusMinutes: number | null;
  breakMinutes: number;
}

export const CADENCE_PRESETS: readonly CadencePreset[] = [
  { id: 'classic',   label: 'Classic',            focusMinutes: 25, breakMinutes: 5 },
  { id: 'extended',  label: 'Extended',           focusMinutes: 50, breakMinutes: 10 },
  { id: 'ultradian', label: 'Ultradian Deep Work', focusMinutes: 90, breakMinutes: 20 },
  { id: 'custom',    label: 'Custom',             focusMinutes: null, breakMinutes: 5 },
];

export const DEFAULT_CADENCE: CadenceId = 'custom';
export const CADENCE_STORAGE_KEY = 'odyssey-cadence';

export function getPreset(id: CadenceId): CadencePreset {
  return CADENCE_PRESETS.find(p => p.id === id) ?? CADENCE_PRESETS[CADENCE_PRESETS.length - 1];
}

export function isCadenceId(value: unknown): value is CadenceId {
  return typeof value === 'string' && CADENCE_PRESETS.some(p => p.id === value);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The saved preference, or "custom" (leave durations alone) when nothing valid is stored. */
export function readCadence(storage: StorageLike | null = defaultStorage()): CadenceId {
  try {
    const value = storage?.getItem(CADENCE_STORAGE_KEY);
    return isCadenceId(value) ? value : DEFAULT_CADENCE;
  } catch {
    return DEFAULT_CADENCE;
  }
}

export function writeCadence(id: CadenceId, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(CADENCE_STORAGE_KEY, id);
  } catch {
    // private mode or a full quota: the choice just lasts until the page closes
  }
}

// ─── Rest interval ───────────────────────────────────────────────────────────

export type RestState =
  | { phase: 'idle' }
  | { phase: 'resting'; endsAt: number; totalSeconds: number }
  | { phase: 'done' };

export const IDLE_REST: RestState = { phase: 'idle' };

export function startRest(breakMinutes: number, now: number): RestState {
  const minutes = Number.isFinite(breakMinutes) && breakMinutes > 0 ? breakMinutes : 5;
  const totalSeconds = Math.round(minutes * 60);
  return { phase: 'resting', endsAt: now + totalSeconds * 1000, totalSeconds };
}

/** Whole seconds left, rounded up so the display never shows 00:00 before the break is actually over. */
export function restRemainingSeconds(state: RestState, now: number): number {
  if (state.phase !== 'resting') return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

/** Moves a resting state to done once its end time has passed; any other state is returned unchanged. */
export function advanceRest(state: RestState, now: number): RestState {
  return state.phase === 'resting' && now >= state.endsAt ? { phase: 'done' } : state;
}

/** 0 at the start of the break, 1 when it ends. */
export function restProgress(state: RestState, now: number): number {
  if (state.phase === 'done') return 1;
  if (state.phase !== 'resting') return 0;
  return Math.min(1, Math.max(0, 1 - restRemainingSeconds(state, now) / state.totalSeconds));
}
