import type { Task } from '../types/database';
import type { EnergyLevel } from './odysseyTypes';
import { safeMissionDuration } from './missionDuration';

/**
 * Next Move engine: a pure, deterministic recommender.
 *
 * It scores every open task from four signals (priority, deadline proximity, energy match and
 * whether the task fits the time on hand) and returns the best one with a short rationale that
 * names the signal that decided it. No network, no randomness: the same input always gives the
 * same answer, so the "why" shown to the user is always true.
 */

export interface NextMoveContext {
  /** Current energy. Unknown energy contributes nothing either way. */
  energy?: EnergyLevel | null;
  /** Minutes the user has right now. Unknown time contributes nothing either way. */
  availableMinutes?: number | null;
  /** Injected clock so tests do not depend on the date. */
  now?: Date;
}

export interface NextMove {
  task: Task;
  score: number;
  /** One line, safe to show as a badge. */
  rationale: string;
  /** Every signal that fired, strongest first, for a longer explanation. */
  reasons: string[];
  minutes: number;
}

export interface NextMoveResult {
  primary: NextMove | null;
  /** Up to three other tasks, best first, so the user can override the pick. */
  alternatives: NextMove[];
}

const DAY_MS = 86_400_000;
const PRIORITY_POINTS: Record<string, number> = { urgent: 40, high: 30, medium: 18, low: 8 };
const QUICK_MINUTES = 30;
const LONG_MINUTES = 60;

const isOpen = (t: Task) => t.status !== 'completed' && t.status !== 'archived';

/** Whole days from now to the deadline (negative when overdue), or null if there is none. */
export function daysUntil(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now.getTime()) / DAY_MS);
}

function deadlinePoints(days: number | null): number {
  if (days === null) return 0;
  if (days < 0) return 45;
  if (days <= 1) return 38;
  if (days <= 3) return 28;
  if (days <= 7) return 16;
  return 5;
}

function deadlineReason(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return `Overdue by ${-days} day${-days === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `Highest urgency with ${days} days left`;
  return null;
}

function scoreTask(task: Task, ctx: NextMoveContext, now: Date): NextMove {
  const days = daysUntil(task.deadline, now);
  const minutes = safeMissionDuration(
    task.estimated_minutes ?? (task.priority === 'urgent' ? 50 : task.priority === 'high' ? 45 : 25),
  );
  const reasons: { points: number; text: string }[] = [];
  let score = 0;

  const priority = PRIORITY_POINTS[task.priority] ?? PRIORITY_POINTS.medium;
  score += priority;
  if (task.priority === 'urgent' || task.priority === 'high') {
    reasons.push({ points: priority, text: `${task.priority === 'urgent' ? 'Urgent' : 'High'} priority` });
  }

  const dl = deadlinePoints(days);
  score += dl;
  const dlText = deadlineReason(days);
  if (dlText) reasons.push({ points: dl + 1, text: dlText });

  const quick = minutes <= QUICK_MINUTES;
  const long = minutes >= LONG_MINUTES;
  if (ctx.energy === 'low') {
    if (quick) {
      score += 14;
      reasons.push({ points: 14, text: 'Quick win matching your low energy' });
    }
    if (long) score -= 14;
  } else if (ctx.energy === 'high') {
    if (long || task.priority === 'urgent' || task.priority === 'high') {
      score += 10;
      reasons.push({ points: 10, text: 'Demanding work, and you have the energy for it' });
    }
  }

  if (ctx.availableMinutes != null) {
    if (minutes <= ctx.availableMinutes) {
      score += 8;
      reasons.push({ points: 8, text: `Fits the ${ctx.availableMinutes} minutes you have` });
    } else {
      score -= 20;
    }
  }

  reasons.sort((a, b) => b.points - a.points);
  const texts = reasons.map((r) => r.text);
  return {
    task,
    score,
    minutes,
    reasons: texts,
    rationale: texts[0] ?? 'Best remaining option right now',
  };
}

/**
 * Rank open tasks. Ties break by earlier deadline, then older task, then id, so the order is
 * stable between renders.
 */
export function rankNextMoves(tasks: Task[], ctx: NextMoveContext = {}): NextMove[] {
  const now = ctx.now ?? new Date();
  return tasks
    .filter(isOpen)
    .map((t) => scoreTask(t, ctx, now))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = a.task.deadline ? new Date(a.task.deadline).getTime() : Infinity;
      const db = b.task.deadline ? new Date(b.task.deadline).getTime() : Infinity;
      if (da !== db) return da - db;
      if (a.task.created_at !== b.task.created_at) return a.task.created_at < b.task.created_at ? -1 : 1;
      return a.task.id < b.task.id ? -1 : 1;
    });
}

export function recommendNextMove(tasks: Task[], ctx: NextMoveContext = {}): NextMoveResult {
  const ranked = rankNextMoves(tasks, ctx);
  return { primary: ranked[0] ?? null, alternatives: ranked.slice(1, 4) };
}
