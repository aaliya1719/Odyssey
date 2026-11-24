/**
 * Mission debrief helpers
 *
 * The optional note a user writes when finishing a mission. Everything that
 * stores or shows it (the finish dialog, the mission service, backup import,
 * the Expedition Trail) goes through these so the rules live in one place.
 */

import type { Mission, MissionSentiment } from '../types/database';

/** Longest debrief note we keep. Mirrors the CHECK constraint on missions.reflection. */
export const MAX_REFLECTION_LENGTH = 1000;

/**
 * Turn whatever was typed or imported into a storable note: trimmed, capped at
 * MAX_REFLECTION_LENGTH, and null when there is nothing (not a string, empty or
 * only whitespace). A skipped debrief and a missing field both come out as null.
 */
export function normalizeReflection(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_REFLECTION_LENGTH).trim();
  return trimmed === '' ? null : trimmed;
}

export interface MissionDebrief {
  /** What the user wrote when finishing, or null if they skipped it. */
  reflection: string | null;
  /** Planning text from when the mission was created, kept apart from the debrief. */
  objective: string | null;
  nextAction: string | null;
}

/** The three texts shown on a waypoint card, each blank or missing value as null. */
export function missionDebrief(mission: Pick<Mission, 'reflection' | 'objective' | 'next_action'>): MissionDebrief {
  const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    reflection: normalizeReflection(mission.reflection),
    objective: clean(mission.objective),
    nextAction: clean(mission.next_action),
  };
}

/** Stored values also match the missions_sentiment_valid database constraint. */
export const MISSION_SENTIMENTS: { value: MissionSentiment; label: string }[] = [
  { value: 'flow', label: 'Flow State' },
  { value: 'focused', label: 'Deep Focus' },
  { value: 'climb', label: 'Challenging Ascent' },
  { value: 'fatigued', label: 'Low Energy' },
];

export function normalizeSentiment(value: unknown): MissionSentiment | null {
  if (value == null) return null;
  const option = MISSION_SENTIMENTS.find(option => option.value === value);
  if (!option) throw new RangeError('Choose a valid expedition sentiment.');
  return option.value;
}
