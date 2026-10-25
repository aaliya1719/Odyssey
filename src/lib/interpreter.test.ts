import { describe, it, test, expect } from 'vitest';
import { interpret, splitClauses } from './interpreter';

function deadlineFor(input: string, referenceDate: string) {
  const result = interpret(input, new Date(referenceDate));
  expect(result.items).toHaveLength(1);
  return result.items[0];
}

test('bare Friday resolves to Friday when reference date is Friday', () => {
  const item = deadlineFor('Finish report by Friday', '2026-10-23T10:00:00.000Z');
  expect(item.deadlineLabel).toBe('Fri');
  expect(item.isoDeadline).toBe('2026-10-23T23:59:00.000Z');
});

test('this week resolves to the current Friday on Friday', () => {
  const item = deadlineFor('Finish report this week', '2026-10-23T10:00:00.000Z');
  expect(item.deadlineLabel).toBe('this week');
  expect(item.isoDeadline).toBe('2026-10-23T23:59:00.000Z');
});

test('this week on Saturday resolves to the Friday just passed', () => {
  const item = deadlineFor('Finish report this week', '2026-10-24T10:00:00.000Z');
  expect(item.isoDeadline).toBe('2026-10-23T23:59:00.000Z');
});

test('this week on Sunday resolves to the Friday just passed', () => {
  const item = deadlineFor('Finish report this week', '2026-10-25T10:00:00.000Z');
  expect(item.isoDeadline).toBe('2026-10-23T23:59:00.000Z');
});

test('this week on Monday resolves to Friday later in the same week', () => {
  const item = deadlineFor('Finish report this week', '2026-10-19T10:00:00.000Z');
  expect(item.isoDeadline).toBe('2026-10-23T23:59:00.000Z');
});

test('bare Friday on Saturday resolves to next Friday', () => {
  const item = deadlineFor('Finish report by Friday', '2026-10-24T10:00:00.000Z');
  expect(item.isoDeadline).toBe('2026-10-30T23:59:00.000Z');
});

test('next Friday on Friday resolves to the following Friday', () => {
  const item = deadlineFor('Finish report next Friday', '2026-10-23T10:00:00.000Z');
  expect(item.isoDeadline).toBe('2026-10-30T23:59:00.000Z');
});


// Explicit "next <weekday>" always means the strictly next occurrence.
// Cover every weekday both when it is upcoming and when today is that weekday.
const weekdays = [
  { name: 'Sunday', day: 0 },
  { name: 'Monday', day: 1 },
  { name: 'Tuesday', day: 2 },
  { name: 'Wednesday', day: 3 },
  { name: 'Thursday', day: 4 },
  { name: 'Friday', day: 5 },
  { name: 'Saturday', day: 6 },
];

function utcDateForWeekday(day: number) {
  // 2026-10-19 is a Monday; use midday UTC to avoid timezone boundary issues.
  return new Date(Date.UTC(2026, 9, 18 + day, 12, 0, 0));
}

for (const target of weekdays) {
  test(`next ${target.name} entered on ${target.name} means one week later`, () => {
    const reference = utcDateForWeekday(target.day);
    const item = deadlineFor(`Finish report next ${target.name}`, reference.toISOString());
    const expected = new Date(reference);
    expected.setDate(expected.getDate() + 7);
    expected.setHours(23, 59, 0, 0);
    expect(item.isoDeadline).toBe(expected.toISOString());
  });
}

for (const current of weekdays) {
  for (const target of weekdays) {
    if (current.day === target.day) continue;
    test(`next ${target.name} entered on ${current.name} resolves to the next occurrence`, () => {
      const reference = utcDateForWeekday(current.day);
      const item = deadlineFor(`Finish report next ${target.name}`, reference.toISOString());
      const expected = new Date(reference);
      const diff = (target.day - current.day + 7) % 7;
      expected.setDate(expected.getDate() + diff);
      expected.setHours(23, 59, 0, 0);
      expect(item.isoDeadline).toBe(expected.toISOString());
    });
  }
}

describe('splitClauses', () => {
  it.each([
    'Research and Development project proposal',
    'Q and A prep',
    'Terms and Conditions review',
    'Review the pros and cons',
    'Buy salt and pepper',
  ])('keeps "%s" as one task', input => {
    expect(splitClauses(input)).toEqual([input]);
  });

  it.each([
    ['email the professor and update my CV', 2],
    ['call mom and buy groceries', 2],
    ['finish report, book flights; water plants', 3],
    ['Write essay. Clean room', 2],
  ])('splits "%s" into %i tasks', (input, count) => {
    expect(splitClauses(input)).toHaveLength(count);
  });
});

describe('interpret', () => {
  it('returns a single item for a title containing "and"', () => {
    const { items } = interpret('Research and Development project proposal');
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Research and Development project proposal');
  });
});
