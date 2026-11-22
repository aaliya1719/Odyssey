import type { FocusSession, Mission, Task } from '../types/database';
import {
  focusWindows,
  obstacleLabels,
  type Obstacle,
  type RetrospectiveDigest,
  type RetrospectiveMetrics,
} from '../../supabase/functions/_shared/retrospective.ts';

const MINUTE = 60_000;
const patterns: Record<Obstacle, RegExp> = {
  interruptions: /\b(interrupt\w*|distract\w*|context switch\w*|notifications?)\b/i,
  scope: /\b(unclear|scope creep|too broad|too big|vague)\b/i,
  dependencies: /\b(waiting|blocked|dependency|dependencies|approval)\b/i,
  energy: /\b(tired|fatigue|low energy|exhausted)\b/i,
  tools: /\b(tooling|setup|build errors?|crash\w*)\b/i,
};

export function aggregateRetrospective(
  missions: readonly Pick<Mission, 'status' | 'created_at' | 'completed_at' | 'reflection'>[],
  tasks: readonly Pick<Task, 'status' | 'completed_at'>[],
  sessions: readonly Pick<FocusSession, 'id' | 'started_at' | 'ended_at'>[],
  now = new Date(),
) {
  const end = now.getTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  const within = (value: string | null) => {
    const time = value ? Date.parse(value) : NaN;
    return time >= start && time <= end;
  };
  const completed = missions.filter(mission => mission.status === 'completed' && within(mission.completed_at));
  const missionsConsidered = missions.filter(mission =>
    within(mission.created_at) || (mission.status === 'completed' && within(mission.completed_at))).length;
  const tasksCompleted = tasks.filter(task => task.status === 'completed' && within(task.completed_at)).length;
  const obstacleCounts: RetrospectiveMetrics['obstacleCounts'] = {
    interruptions: 0, scope: 0, dependencies: 0, energy: 0, tools: 0,
  };
  for (const { reflection } of completed) {
    if (!reflection) continue;
    for (const key of Object.keys(patterns) as Obstacle[]) {
      if (patterns[key].test(reflection)) obstacleCounts[key]++;
    }
  }

  const seen = new Set<string>();
  const intervals: Array<[number, number]> = [];
  for (const session of sessions) {
    if (!session.ended_at || seen.has(session.id)) continue;
    const from = Math.max(start, Date.parse(session.started_at));
    const stopped = Date.parse(session.ended_at);
    if (Number.isFinite(from) && stopped <= end && from < stopped) {
      intervals.push([from, stopped]);
      seen.add(session.id);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);

  // Count elapsed focus once even if two tabs recorded overlapping sessions.
  const totals = [0, 0, 0, 0];
  let previousEnd = start;
  for (const [from, to] of intervals) {
    let current = Math.max(previousEnd, from);
    while (current < to) {
      const local = new Date(current);
      const next = Math.min(to, current + MINUTE - local.getSeconds() * 1000 - local.getMilliseconds());
      totals[Math.floor(local.getHours() / 6)] += next - current;
      current = next;
    }
    previousEnd = Math.max(previousEnd, to);
  }
  const focusByWindow = totals.map(ms => Math.round(ms / MINUTE)) as RetrospectiveMetrics['focusByWindow'];
  return {
    start: new Date(start),
    end: new Date(end),
    metrics: { missionsConsidered, missionsCompleted: completed.length, tasksCompleted, focusSessions: intervals.length, focusByWindow, obstacleCounts },
  };
}

export function peakFocusWindow(metrics: RetrospectiveMetrics): string {
  const largest = Math.max(...metrics.focusByWindow);
  if (largest === 0) return 'No recorded focus window';
  const peak = focusWindows.filter((_, index) => metrics.focusByWindow[index] === largest);
  return peak.join(' and ');
}

export function localRetrospective(metrics: RetrospectiveMetrics): RetrospectiveDigest {
  const focusMinutes = metrics.focusByWindow.reduce((total, value) => total + value, 0);
  const highest = Math.max(...Object.values(metrics.obstacleCounts));
  const themes = (Object.keys(obstacleLabels) as Obstacle[])
    .filter(key => highest > 0 && metrics.obstacleCounts[key] === highest)
    .map(key => obstacleLabels[key].toLowerCase());
  const victory = metrics.missionsCompleted > 0
    ? `You finished ${metrics.missionsCompleted} of ${metrics.missionsConsidered} missions in view.`
    : metrics.tasksCompleted > 0
      ? `You completed ${metrics.tasksCompleted} tasks this week.`
      : focusMinutes > 0 ? `You logged ${focusMinutes} minutes of focus.` : 'There is no completed work or focus time logged in this window yet.';
  const friction = themes.length ? `Most frequent debrief themes: ${themes.join(', ')}.` : 'No recurring obstacle was identified in the available debriefs.';
  const strategy = focusMinutes > 0
    ? 'Reserve a focus block in one of your strongest windows and choose a single outcome before starting.'
    : 'Log one short focus session and a quick debrief to make next week’s patterns easier to spot.';
  return { victory, friction, strategy };
}
