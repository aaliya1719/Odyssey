import { describe, expect, it } from 'vitest';
import { applyClarification, clarificationKind, skipClarification } from './clarification';
import type { AIItem } from './odysseyTypes';

const task: AIItem = {
  text: 'Finish biology assignment',
  category: 'task',
  deadlineLabel: null,
  isoDeadline: null,
  priority: 'medium',
  isConsistency: false,
  ambiguity: null,
};

const now = new Date(2026, 9, 25, 12);

describe('clarificationKind', () => {
  it('asks for a missing deadline in offline and AI interpretations', () => {
    expect(clarificationKind(task)).toBe('timeline');
    expect(clarificationKind({ ...task, ambiguity: 'Deadline is unclear' })).toBe('timeline');
  });

  it('asks for scope when the deliverable is vague, even with a deadline', () => {
    expect(clarificationKind({ ...task, text: 'Work on project', isoDeadline: now.toISOString() })).toBe('scope');
    expect(clarificationKind({ ...task, ambiguity: 'Which deliverable?' })).toBe('scope');
  });

  it('does not interrupt a specific task or a consistency goal', () => {
    expect(clarificationKind({ ...task, text: 'Email biology notes to Maya' })).toBeNull();
    expect(clarificationKind({ ...task, isConsistency: true, ambiguity: 'Unclear time' })).toBeNull();
  });
});

describe('applyClarification', () => {
  it('updates the deadline, category, and urgency before planning', () => {
    const today = applyClarification(task, 'timeline', 'today', now);
    expect(today?.deadlineLabel).toBe('today');
    expect(today?.category).toBe('deadline');
    expect(today?.priority).toBe('urgent');
    expect(new Date(today!.isoDeadline!).getDate()).toBe(25);

    const tomorrow = applyClarification(task, 'timeline', 'tomorrow', now);
    expect(tomorrow?.priority).toBe('high');
    expect(new Date(tomorrow!.isoDeadline!).getDate()).toBe(26);
  });

  it('accepts future dates and rejects malformed, impossible, or past dates', () => {
    expect(applyClarification(task, 'timeline', '2026-11-15', now)?.category).toBe('upcoming');
    expect(applyClarification(task, 'timeline', '2026-02-30', now)).toBeNull();
    expect(applyClarification(task, 'timeline', '2026-10-24', now)).toBeNull();
    expect(applyClarification(task, 'timeline', 'someday', now)).toBeNull();
  });

  it('replaces vague scope while preserving the deadline and priority', () => {
    const vague = { ...task, text: 'Work on project', isoDeadline: now.toISOString() };
    const clarified = applyClarification(vague, 'scope', '  Finish the slides  ', now);
    expect(clarified).toMatchObject({
      text: 'Finish the slides',
      isoDeadline: vague.isoDeadline,
      priority: vague.priority,
      ambiguity: null,
      clarificationDismissed: true,
    });
    expect(applyClarification(vague, 'scope', '   ', now)).toBeNull();
  });

  it('lets the user proceed without changing an item', () => {
    const skipped = skipClarification(task);
    expect(skipped).toMatchObject({ text: task.text, isoDeadline: null, priority: task.priority });
    expect(clarificationKind(skipped)).toBeNull();
  });
});
