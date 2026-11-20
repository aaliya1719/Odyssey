/**
 * Time-block engine.
 *
 * Pure, deterministic helpers that lay missions out on a day timeline and match
 * task energy against the user's energy curve. All times are minutes since
 * midnight, so there is no timezone or Date handling in here.
 */

export type Energy = 'high' | 'medium' | 'low';
export type EnergyCurve = 'morning' | 'balanced' | 'night';

export interface BlockInput {
  id: string;
  title: string;
  minutes: number;
  energy: Energy;
}

export interface TimeBlock {
  id: string;
  title: string;
  start: number;
  end: number;
  energy: Energy;
  kind: 'work' | 'break';
}

export interface Window {
  start: number;
  end: number;
}

export interface Schedule {
  blocks: TimeBlock[];
  /** Missions that did not fit inside the window. */
  overflow: BlockInput[];
}

export interface ScheduleWarning {
  kind: 'overflow' | 'overlap' | 'outside-window';
  ids: string[];
  message: string;
}

/** Parses "HH:MM" into minutes since midnight. Returns null if invalid. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Alertness per curve as [startHour, endHour, level] bands. Anything not
// covered counts as medium.
const CURVES: Record<EnergyCurve, Array<[number, number, Energy]>> = {
  morning:  [[6, 12, 'high'], [13, 15, 'low'], [15, 17, 'medium'], [17, 24, 'low']],
  balanced: [[9, 11, 'high'], [11, 13, 'medium'], [13, 15, 'low'], [15, 17, 'high'], [17, 24, 'low']],
  night:    [[6, 11, 'low'], [11, 15, 'medium'], [15, 24, 'high']],
};

/** Energy level the user is expected to have at a given minute. */
export function energyAt(curve: EnergyCurve, minute: number): Energy {
  const hour = (((minute % 1440) + 1440) % 1440) / 60;
  for (const [from, to, level] of CURVES[curve]) {
    if (hour >= from && hour < to) return level;
  }
  return 'medium';
}

const RANK: Record<Energy, number> = { high: 2, medium: 1, low: 0 };

/** Short tasks get a 5 minute pause, longer ones 10. */
export function breakLength(workMinutes: number): number {
  return workMinutes <= 30 ? 5 : 10;
}

/** Clips a block so it sits inside the window. Returns null if nothing is left. */
export function clipToWindow<T extends { start: number; end: number }>(block: T, win: Window): T | null {
  const start = Math.max(block.start, win.start);
  const end = Math.min(block.end, win.end);
  return end > start ? { ...block, start, end } : null;
}

/**
 * Builds a schedule. At each step it looks at the energy available right now and
 * picks the best matching remaining mission: the longest high-energy one during a
 * peak, the shortest low-energy one during a slump, otherwise the closest match.
 * Ties break on the input order, so the output is stable.
 */
export function generateSchedule(items: BlockInput[], win: Window, curve: EnergyCurve): Schedule {
  const remaining = items.filter(i => Number.isFinite(i.minutes) && i.minutes > 0);
  const blocks: TimeBlock[] = [];
  const overflow: BlockInput[] = [];
  let cursor = win.start;

  while (remaining.length > 0) {
    const level = energyAt(curve, cursor);
    const idx = pickIndex(remaining, level);
    const item = remaining[idx];
    if (cursor + item.minutes > win.end) {
      // Try something shorter before giving up on the rest of the day.
      const fit = remaining.findIndex(r => cursor + r.minutes <= win.end);
      if (fit === -1) { overflow.push(...remaining); break; }
      const alt = remaining.splice(fit, 1)[0];
      cursor = place(blocks, alt, cursor, win);
      continue;
    }
    remaining.splice(idx, 1);
    cursor = place(blocks, item, cursor, win);
  }
  return { blocks, overflow };
}

function pickIndex(items: BlockInput[], level: Energy): number {
  let best = 0;
  for (let i = 1; i < items.length; i++) {
    const a = items[best];
    const b = items[i];
    const da = Math.abs(RANK[a.energy] - RANK[level]);
    const db = Math.abs(RANK[b.energy] - RANK[level]);
    if (db < da) best = i;
    else if (db === da) {
      // Same match quality: hardest first in a peak, quickest first in a slump.
      if (level === 'low' ? b.minutes < a.minutes : b.minutes > a.minutes) best = i;
    }
  }
  return best;
}

function place(blocks: TimeBlock[], item: BlockInput, cursor: number, win: Window): number {
  const end = cursor + item.minutes;
  blocks.push({ id: item.id, title: item.title, start: cursor, end, energy: item.energy, kind: 'work' });
  const pause = breakLength(item.minutes);
  if (end + pause < win.end) {
    blocks.push({ id: `break-${item.id}`, title: 'Recovery', start: end, end: end + pause, energy: 'low', kind: 'break' });
    return end + pause;
  }
  return end;
}

/** Ids of every pair of blocks whose time ranges overlap. */
export function findOverlaps(blocks: TimeBlock[]): Array<[string, string]> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
      out.push([sorted[i].id, sorted[j].id]);
    }
  }
  return out;
}

/** Moves one block to a new start, keeping its length and clamping to the window. */
export function moveBlock(blocks: TimeBlock[], id: string, newStart: number, win: Window): TimeBlock[] {
  return blocks.map(b => {
    if (b.id !== id) return b;
    const length = b.end - b.start;
    const start = Math.min(Math.max(newStart, win.start), Math.max(win.start, win.end - length));
    return { ...b, start, end: start + length };
  });
}

/**
 * Swaps the order of two blocks. Together they keep occupying the same span:
 * the later one moves to the front, anything between them (breaks) shifts by
 * the difference in length, and the earlier one ends where the span ends.
 */
export function swapBlocks(blocks: TimeBlock[], idA: string, idB: string): TimeBlock[] {
  const a = blocks.find(b => b.id === idA);
  const b = blocks.find(b => b.id === idB);
  if (!a || !b || a.id === b.id) return blocks;
  const [first, second] = a.start <= b.start ? [a, b] : [b, a];
  const firstLen = first.end - first.start;
  const secondLen = second.end - second.start;
  return blocks.map(x => {
    if (x.id === second.id) return { ...x, start: first.start, end: first.start + secondLen };
    if (x.id === first.id) return { ...x, start: second.end - firstLen, end: second.end };
    if (x.start >= first.end && x.end <= second.start) {
      const shift = secondLen - firstLen;
      return { ...x, start: x.start + shift, end: x.end + shift };
    }
    return x;
  });
}

/** Everything the UI should warn about for the current layout. */
export function checkSchedule(schedule: Schedule, win: Window): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const workMinutes = schedule.blocks.filter(b => b.kind === 'work').reduce((s, b) => s + (b.end - b.start), 0);
  const overflowMinutes = schedule.overflow.reduce((s, i) => s + i.minutes, 0);

  if (schedule.overflow.length > 0 || workMinutes > win.end - win.start) {
    warnings.push({
      kind: 'overflow',
      ids: schedule.overflow.map(i => i.id),
      message: `${workMinutes + overflowMinutes} min of missions will not fit in ${win.end - win.start} available minutes.`,
    });
  }
  for (const [a, b] of findOverlaps(schedule.blocks)) {
    warnings.push({ kind: 'overlap', ids: [a, b], message: 'Two blocks overlap, including breaks.' });
  }
  const outside = schedule.blocks.filter(b => b.start < win.start || b.end > win.end).map(b => b.id);
  if (outside.length > 0) {
    warnings.push({ kind: 'outside-window', ids: outside, message: 'Some blocks run outside your work window.' });
  }
  return warnings;
}
