import { describe, expect, it } from 'vitest';
import { interpret } from '../src/lib/interpreter';
import { buildApproaches, missionFromApproach } from '../src/lib/planner';

describe('interpret', () => {
  it('extracts and sorts deadline items from a capture', () => {
    const result = interpret('Read a chapter tomorrow, submit the report tonight');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      text: 'submit the report',
      category: 'deadline',
      deadlineLabel: 'today',
    });
    expect(result.items[1]).toMatchObject({
      text: 'Read a chapter',
      category: 'deadline',
      deadlineLabel: 'tomorrow',
    });
  });

  it('recognises ongoing work as a goal', () => {
    const result = interpret('maintain a daily reading habit');

    expect(result.items[0]).toMatchObject({
      category: 'goal',
      priority: 'low',
      text: 'maintain a daily reading habit',
    });
  });
});

describe('buildApproaches', () => {
  it('creates three approaches over the same items', () => {
    const items = interpret('submit the report tonight, maintain a daily reading habit').items;
    const approaches = buildApproaches(items);

    expect(approaches.map(approach => approach.id)).toEqual([
      'deadline',
      'balanced',
      'consistency',
    ]);
    expect(approaches.every(approach => approach.items)).toBe(true);
    expect(approaches.every(approach => approach.items.length === items.length)).toBe(true);
    expect(approaches[0].items[0].item.text).toBe('submit the report');
    expect(approaches[2].items.map(({ item }) => item.text)).toEqual(expect.arrayContaining([
      'submit the report',
      'maintain a daily reading habit',
    ]));
    expect(approaches[2].items.some(({ framing }) => framing.includes('habit'))).toBe(true);
  });

  it('derives an executable mission from the top item', () => {
    const approach = buildApproaches(interpret('write the report tonight').items)[0];
    const mission = missionFromApproach(approach);

    expect(mission.title).toContain('report');
    expect(mission.objective).toBeTruthy();
    expect(mission.next_action).toBeTruthy();
    expect(mission.planned_minutes).toBeGreaterThan(0);
  });
});
