/**
 * Multi-session task helpers
 *
 * A task can be worked on across several missions. Finishing one mission logs
 * its focus session but only closes the parent task when the user says so.
 * These pure helpers hold that choice and the per-task focus totals shown on
 * the task rows and the linked-task chips.
 */

import type { FocusSession, Mission } from '../types/database';
import { focusByMission, formatMinutes } from './expeditionTrail';

/** What happens to the parent task when a mission is finished. */
export type TaskOutcome = 'keep' | 'complete';

export const DEFAULT_TASK_OUTCOME: TaskOutcome = 'keep';

/** The choices offered when finishing a mission that belongs to a task, default first. */
export const TASK_OUTCOME_OPTIONS: { value: TaskOutcome; label: string; hint: string }[] = [
  { value: 'keep', label: 'Keep task in progress', hint: 'Log this session and leave the task open for the next one.' },
  { value: 'complete', label: 'Mark task completed', hint: 'The task is done, so close it along with this mission.' },
];

/** The task a mission belongs to: the one it was launched from, else the mission's own task_id. */
export function resolveLinkedTaskId(
  launchedFromTaskId: string | null | undefined,
  missionTaskId: string | null | undefined,
): string | null {
  return launchedFromTaskId || missionTaskId || null;
}

/** The id of the task to mark completed for this outcome, or null when the task should be left alone. */
export function taskIdToComplete(outcome: TaskOutcome, taskId: string | null | undefined): string | null {
  return outcome === 'complete' && taskId ? taskId : null;
}

export interface TaskFocusTotals {
  /** Finished focus sessions across the task's missions. */
  sessions: number;
  /** Minutes logged across all of the task's sessions, finished or not. */
  minutes: number;
}

/**
 * Roll focus sessions up to tasks through missions.task_id. Missions without a
 * task and sessions without a known mission are ignored, so nothing is counted
 * twice and nothing lands on the wrong task.
 */
export function taskFocusTotals(missions: Mission[], sessions: FocusSession[]): Map<string, TaskFocusTotals> {
  const byMission = focusByMission(sessions);
  const totals = new Map<string, TaskFocusTotals>();
  for (const mission of missions) {
    if (!mission.task_id) continue;
    const focus = byMission.get(mission.id);
    if (!focus) continue;
    const entry = totals.get(mission.task_id) ?? { sessions: 0, minutes: 0 };
    entry.sessions += focus.sessions;
    entry.minutes += focus.minutes;
    totals.set(mission.task_id, entry);
  }
  return totals;
}

/** "2 sessions · 50m logged", or null when nothing has been logged for the task yet. */
export function formatTaskFocus(totals: TaskFocusTotals | null | undefined): string | null {
  if (!totals || (totals.sessions === 0 && totals.minutes === 0)) return null;
  const logged = `${formatMinutes(totals.minutes)} logged`;
  if (totals.sessions === 0) return logged;
  return `${totals.sessions} ${totals.sessions === 1 ? 'session' : 'sessions'} · ${logged}`;
}
