import type { AIItem } from './odysseyTypes';

export type ClarificationKind = 'timeline' | 'scope';

/** Ask only when an AI note or a concrete offline pattern signals a material gap. */
export function clarificationKind(item: AIItem): ClarificationKind | null {
  if (item.clarificationDismissed || item.isConsistency) return null;

  const note = item.ambiguity?.trim();
  if (note) {
    return /\b(deadline|when|date|time|due|schedule)\b/i.test(note)
      ? 'timeline'
      : 'scope';
  }

  if (/\b(work on|make progress on|start)\b.*\b(project|assignment|report|presentation|app)\b/i.test(item.text)) {
    return 'scope';
  }
  if (!item.isoDeadline && !item.deadlineLabel && item.category === 'task' &&
      /\b(finish|complete|submit|send|deliver|turn in)\b/i.test(item.text)) {
    return 'timeline';
  }
  return null;
}

function calendarDaysBetween(a: Date, b: Date): number {
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bDay - aDay) / 86_400_000);
}

function parseDateAnswer(answer: string, now: Date): { date: Date; label: string } | null {
  const today = new Date(now);
  today.setHours(23, 59, 0, 0);

  let date: Date;
  let label: string;
  if (answer === 'today' || answer === 'tomorrow' || answer === 'next_week') {
    date = new Date(today);
    date.setDate(date.getDate() + (answer === 'today' ? 0 : answer === 'tomorrow' ? 1 : 7));
    label = answer === 'next_week' ? 'next week' : answer;
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(answer);
    if (!match) return null;
    const [, year, month, day] = match.map(Number);
    date = new Date(year, month - 1, day, 23, 59);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return calendarDaysBetween(now, date) < 0 ? null : { date, label };
}

/** Return null for an empty or invalid answer so the review item stays unchanged. */
export function applyClarification(
  item: AIItem,
  kind: ClarificationKind,
  answer: string,
  now = new Date(),
): AIItem | null {
  if (kind === 'scope') {
    const text = answer.trim();
    if (!text) return null;
    return { ...item, text, ambiguity: null, clarificationDismissed: true };
  }

  const parsed = parseDateAnswer(answer, now);
  if (!parsed) return null;
  const daysAway = calendarDaysBetween(now, parsed.date);
  return {
    ...item,
    isoDeadline: parsed.date.toISOString(),
    deadlineLabel: parsed.label,
    category: daysAway <= 7 ? 'deadline' : 'upcoming',
    priority: daysAway === 0 ? 'urgent' : daysAway === 1 ? 'high' : item.priority,
    ambiguity: null,
    clarificationDismissed: true,
  };
}

export function skipClarification(item: AIItem): AIItem {
  return { ...item, ambiguity: null, clarificationDismissed: true };
}
