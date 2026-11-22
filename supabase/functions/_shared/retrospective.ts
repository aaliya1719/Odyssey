export const focusWindows = [
  'Night · 00:00–06:00',
  'Morning · 06:00–12:00',
  'Afternoon · 12:00–18:00',
  'Evening · 18:00–00:00',
] as const;

export const obstacleLabels = {
  interruptions: 'Interruptions',
  scope: 'Unclear scope',
  dependencies: 'Waiting on dependencies',
  energy: 'Low energy',
  tools: 'Tooling problems',
} as const;

export type Obstacle = keyof typeof obstacleLabels;
export type RetrospectiveMetrics = {
  missionsConsidered: number;
  missionsCompleted: number;
  tasksCompleted: number;
  focusSessions: number;
  focusByWindow: [number, number, number, number];
  obstacleCounts: Record<Obstacle, number>;
};

export type RetrospectiveDigest = {
  victory: string;
  friction: string;
  strategy: string;
};

const metricKeys = [
  'missionsConsidered', 'missionsCompleted', 'tasksCompleted', 'focusSessions', 'focusByWindow', 'obstacleCounts',
];
const obstacleKeys = Object.keys(obstacleLabels) as Obstacle[];
const digestKeys = ['victory', 'friction', 'strategy'] as const;

function hasKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
}

export function parseRetrospectiveMetrics(input: unknown): RetrospectiveMetrics | null {
  if (!hasKeys(input, metricKeys)) return null;
  const { missionsConsidered, missionsCompleted, tasksCompleted, focusSessions, focusByWindow, obstacleCounts } = input;
  if (!count(missionsConsidered) || !count(missionsCompleted) || missionsCompleted > missionsConsidered
    || !count(tasksCompleted) || !count(focusSessions) || !Array.isArray(focusByWindow) || focusByWindow.length !== 4
    || ![...focusByWindow].every(count) || !hasKeys(obstacleCounts, obstacleKeys)
    || !obstacleKeys.every(key => count(obstacleCounts[key]) && obstacleCounts[key] <= missionsCompleted)) return null;

  return {
    missionsConsidered,
    missionsCompleted,
    tasksCompleted,
    focusSessions,
    focusByWindow: [...focusByWindow] as RetrospectiveMetrics['focusByWindow'],
    obstacleCounts: Object.fromEntries(obstacleKeys.map(key => [key, obstacleCounts[key]])) as RetrospectiveMetrics['obstacleCounts'],
  };
}

export function parseRetrospectiveDigest(input: unknown): RetrospectiveDigest | null {
  if (!hasKeys(input, digestKeys)) return null;
  const { victory, friction, strategy } = input;
  const valid = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= 360 && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
  if (!valid(victory) || !valid(friction) || !valid(strategy)) return null;
  return { victory: victory.trim(), friction: friction.trim(), strategy: strategy.trim() };
}

export function retrospectivePrompt(value: unknown): string | null {
  const metrics = parseRetrospectiveMetrics(value);
  if (!metrics) return null;
  return [
    'Write a brief, encouraging seven-day productivity retrospective grounded only in these aggregates.',
    'Return exactly one JSON object with the string keys victory, friction, strategy. Each value must be at most 360 characters.',
    'Describe the highest recorded obstacle count if any. If none, say no clear obstacle was recorded. Do not infer personal details or invent events.',
    'Suggest one practical next step. Focus windows are local clock hours, listed as night, morning, afternoon, evening.',
    JSON.stringify(metrics),
  ].join('\n');
}
