import type { Task, TaskPriority } from '../types/database';

export type PriorityFilter = 'all' | TaskPriority;

export const PRIORITY_FILTERS: { id: PriorityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

/** True when the query (case-insensitive, trimmed) appears in the title, description or any tag. */
export function matchesTaskSearch(
  task: Pick<Task, 'title' | 'description' | 'tags'>,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  // "#work" should find the tag "work", the same way tags are shown on the card.
  const tagNeedle = needle.startsWith('#') ? needle.slice(1) : needle;
  if (task.title.toLowerCase().includes(needle)) return true;
  if (task.description?.toLowerCase().includes(needle)) return true;
  return (task.tags ?? []).some((tag) => tag.toLowerCase().includes(tagNeedle));
}

export function matchesPriority(task: Pick<Task, 'priority'>, filter: PriorityFilter): boolean {
  return filter === 'all' || task.priority === filter;
}

/** Applies the text search and the priority pill together, keeping the original order. */
export function filterTasks<T extends Pick<Task, 'title' | 'description' | 'tags' | 'priority'>>(
  tasks: T[],
  query: string,
  priority: PriorityFilter,
): T[] {
  if (!query.trim() && priority === 'all') return tasks;
  return tasks.filter((t) => matchesPriority(t, priority) && matchesTaskSearch(t, query));
}
