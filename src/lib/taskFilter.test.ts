import { describe, expect, it } from 'vitest';
import type { TaskPriority } from '../types/database';
import { filterTasks, matchesPriority, matchesTaskSearch } from './taskFilter';

function t(title: string, over: { description?: string | null; tags?: string[]; priority?: TaskPriority } = {}) {
  return { title, description: over.description ?? null, tags: over.tags ?? [], priority: over.priority ?? 'medium' };
}

describe('matchesTaskSearch', () => {
  it('matches everything for an empty or whitespace query', () => {
    expect(matchesTaskSearch(t('Anything'), '')).toBe(true);
    expect(matchesTaskSearch(t('Anything'), '   ')).toBe(true);
  });
  it('matches title case-insensitively', () => {
    expect(matchesTaskSearch(t('Write Report'), 'report')).toBe(true);
    expect(matchesTaskSearch(t('Write Report'), 'REPORT')).toBe(true);
    expect(matchesTaskSearch(t('Write Report'), 'budget')).toBe(false);
  });
  it('matches description and tags', () => {
    expect(matchesTaskSearch(t('A', { description: 'Call the Dentist' }), 'dentist')).toBe(true);
    expect(matchesTaskSearch(t('A', { tags: ['health'] }), 'heal')).toBe(true);
    expect(matchesTaskSearch(t('A', { tags: ['health'] }), '#health')).toBe(true);
  });
  it('copes with a null description and missing tags', () => {
    expect(matchesTaskSearch({ title: 'x', description: null, tags: undefined as unknown as string[] }, 'y')).toBe(false);
  });
});

describe('matchesPriority', () => {
  it('"all" accepts any priority; others are exact', () => {
    expect(matchesPriority(t('x', { priority: 'low' }), 'all')).toBe(true);
    expect(matchesPriority(t('x', { priority: 'low' }), 'low')).toBe(true);
    expect(matchesPriority(t('x', { priority: 'low' }), 'urgent')).toBe(false);
  });
});

describe('filterTasks', () => {
  const tasks = [
    t('Fix login bug', { priority: 'urgent', tags: ['work'] }),
    t('Buy milk', { priority: 'low' }),
    t('Plan trip', { priority: 'high', description: 'Book login for the hotel site' }),
  ];
  it('returns the same array when no filter is active', () => {
    expect(filterTasks(tasks, '', 'all')).toBe(tasks);
  });
  it('combines search and priority', () => {
    expect(filterTasks(tasks, 'login', 'all').map((x) => x.title)).toEqual(['Fix login bug', 'Plan trip']);
    expect(filterTasks(tasks, 'login', 'urgent').map((x) => x.title)).toEqual(['Fix login bug']);
    expect(filterTasks(tasks, '', 'low').map((x) => x.title)).toEqual(['Buy milk']);
    expect(filterTasks(tasks, 'nothing', 'all')).toEqual([]);
  });
  it('stays fast on a few hundred tasks', () => {
    const many = Array.from({ length: 500 }, (_, i) => t(`Task ${i}`, { tags: ['a'], priority: i % 2 ? 'high' : 'low' }));
    const start = performance.now();
    filterTasks(many, 'task 49', 'high');
    expect(performance.now() - start).toBeLessThan(50);
  });
});
