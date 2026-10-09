/**
 * Odyssey Input Interpreter
 *
 * Deterministic, client-side natural-language analysis.
 * No external API required. Parses free-text capture input into structured
 * InterpretedItems that can be shown to the user and saved as Tasks.
 */

import type { TaskPriority } from '../types/database';

// ─── Output types ─────────────────────────────────────────────────────────────

export type ItemCategory =
  | 'deadline'   // has a near deadline (≤7 days)
  | 'upcoming'   // has a deadline further out (>7 days)
  | 'goal'       // ongoing / habitual / open-ended
  | 'task';      // generic discrete task

export interface InterpretedItem {
  text: string;
  category: ItemCategory;
  deadlineLabel?: string;      // human-readable, e.g. "Friday", "next Monday"
  deadlineDate?: Date;         // resolved absolute date for sorting
  priority: TaskPriority;
  isoDeadline?: string;        // ISO string for taskService, if deadline resolved
}

export interface InterpretationResult {
  items: InterpretedItem[];
  rawInput: string;
}

// ─── Deadline detection ───────────────────────────────────────────────────────

/** Day-name patterns and their offsets from today (0 = same weekday ahead) */
const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function nextWeekdayDate(targetDay: number): Date {
  const today = new Date();
  today.setHours(23, 59, 0, 0);
  const current = today.getDay(); // 0=Sun
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;       // always the NEXT occurrence
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d;
}

interface DeadlineParse {
  label: string;
  date: Date;
}

function parseDeadline(text: string): DeadlineParse | null {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(23, 59, 0, 0);

  // "today"
  if (/\btoday\b/.test(lower)) {
    return { label: 'today', date: today };
  }
  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { label: 'tomorrow', date: d };
  }
  // "this week" / "by end of week" / "end of week"
  if (/\bthis\s+week\b|\bend\s+of\s+(the\s+)?week\b/.test(lower)) {
    // treat as Friday of current week
    const d = nextWeekdayDate(5);
    return { label: 'this week', date: d };
  }
  // "next week"
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return { label: 'next week', date: d };
  }
  // "next <dayname>" — explicit "next Monday"
  const nextDayMatch = lower.match(/\bnext\s+(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)\b/);
  if (nextDayMatch) {
    const dayNum = DAY_NAMES[nextDayMatch[1]];
    const d = nextWeekdayDate(dayNum);
    // push one more week to enforce "next" semantics
    d.setDate(d.getDate() + 7);
    const label = 'next ' + nextDayMatch[1].charAt(0).toUpperCase() + nextDayMatch[1].slice(1, 3);
    return { label, date: d };
  }
  // bare day name — "due Friday", "by Monday", "on Tuesday", or just "Friday"
  const dayMatch = lower.match(/\b(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)\b/);
  if (dayMatch) {
    const dayNum = DAY_NAMES[dayMatch[1]];
    const d = nextWeekdayDate(dayNum);
    const label = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1, 3);
    return { label, date: d };
  }
  // "in X days/weeks"
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+(day|days)\b/);
  if (inDaysMatch) {
    const n = parseInt(inDaysMatch[1], 10);
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return { label: `in ${n} day${n === 1 ? '' : 's'}`, date: d };
  }
  const inWeeksMatch = lower.match(/\bin\s+(\d+)\s+(week|weeks)\b/);
  if (inWeeksMatch) {
    const n = parseInt(inWeeksMatch[1], 10);
    const d = new Date(today);
    d.setDate(d.getDate() + n * 7);
    return { label: `in ${n} week${n === 1 ? '' : 's'}`, date: d };
  }

  return null;
}

// ─── Priority detection ───────────────────────────────────────────────────────

function parsePriority(text: string): TaskPriority {
  const lower = text.toLowerCase();
  if (/\b(urgent|asap|critical|emergency|immediately|right away|must\s+do|need\s+to\s+do\s+now)\b/.test(lower)) {
    return 'urgent';
  }
  if (/\b(important|high\s+priority|really\s+need|crucial|significant|key|major)\b/.test(lower)) {
    return 'high';
  }
  if (/\b(keep|continue|ongoing|habit|practice|learning|study|explore|read|want\s+to)\b/.test(lower)) {
    return 'low';
  }
  return 'medium';
}

// ─── Goal/habit detection ─────────────────────────────────────────────────────

function isOngoingGoal(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(keep|continue|ongoing|habit|practice|learning|study|explore|read|want\s+to|trying\s+to|working\s+on|improve|get\s+better|build|develop|maintain)\b/.test(lower);
}

// ─── Text cleaning ─────────────────────────────────────────────────────────────

/** Remove deadline/qualifier phrases to get a cleaner task title */
function cleanTitle(text: string): string {
  return text
    .replace(/\b(due|by|on|before|for|until|at|around)\s+(next\s+)?(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)\b/gi, '')
    .replace(/\bnext\s+(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)\b/gi, '')
    .replace(/\b(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)\b/gi, '')
    .replace(/\btoday\b/gi, '')
    .replace(/\btomorrow\b/gi, '')
    .replace(/\bthis\s+week\b/gi, '')
    .replace(/\bnext\s+week\b/gi, '')
    .replace(/\bin\s+\d+\s+(day|days|week|weeks)\b/gi, '')
    .replace(/\b(urgent|asap|important|high\s+priority)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;.]+|[\s,;.]+$/g, '')
    .trim();
}

// ─── Sentence / clause splitting ─────────────────────────────────────────────

/**
 * Split free-form input into individual clauses.
 * Handles: comma lists, "and" conjunctions, semicolons, sentence boundaries.
 */
function splitClauses(input: string): string[] {
  // Normalise line breaks
  const normalised = input.replace(/\r?\n/g, ', ');

  // Split on: comma, semicolon, period (if followed by space+capital), " and "
  const raw = normalised
    .split(/,\s*|\s*;\s*|\s+and\s+|\.\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  return raw;
}

// ─── Category assignment ─────────────────────────────────────────────────────

function assignCategory(
  text: string,
  deadline: DeadlineParse | null,
): ItemCategory {
  if (!deadline) {
    return isOngoingGoal(text) ? 'goal' : 'task';
  }
  const daysAway = Math.ceil(
    (deadline.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return daysAway <= 7 ? 'deadline' : 'upcoming';
}

// ─── Main interpreter ─────────────────────────────────────────────────────────

export function interpret(rawInput: string): InterpretationResult {
  const clauses = splitClauses(rawInput);

  const items: InterpretedItem[] = clauses.map((clause): InterpretedItem => {
    const deadline = parseDeadline(clause);
    const priority = parsePriority(clause);
    const category = assignCategory(clause, deadline);
    const cleanedTitle = cleanTitle(clause);

    return {
      text: cleanedTitle || clause.trim(),
      category,
      deadlineLabel: deadline?.label,
      deadlineDate: deadline?.date,
      priority,
      isoDeadline: deadline?.date?.toISOString(),
    };
  });

  // Sort: deadline (nearest first) → upcoming → task → goal
  const ORDER: Record<ItemCategory, number> = {
    deadline: 0,
    upcoming: 1,
    task: 2,
    goal: 3,
  };

  items.sort((a, b) => {
    const orderDiff = ORDER[a.category] - ORDER[b.category];
    if (orderDiff !== 0) return orderDiff;
    // Within same category, sort by deadline proximity
    if (a.deadlineDate && b.deadlineDate) {
      return a.deadlineDate.getTime() - b.deadlineDate.getTime();
    }
    return 0;
  });

  return { items, rawInput };
}
