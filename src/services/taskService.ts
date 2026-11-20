import { supabase } from '../lib/supabase';
import { localTasks } from '../lib/localStore';
import { normalizeTags } from '../lib/hashtags';
import { enqueue, isNetworkError, type QueuedMutation } from '../lib/mutationQueue';
import type { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../types/database';

/** Returns the current authenticated user, or null if anonymous. */
async function getUser() {
  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user;
  // Offline, getUser() cannot reach the server; the cached session still knows who we are.
  const { data: sess } = await supabase.auth.getSession();
  return sess.session?.user ?? null;
}

function insertRow(userId: string, id: string, input: CreateTaskInput) {
  return {
    id,
    user_id:           userId,
    title:             input.title,
    tags:              normalizeTags(input.tags),
    description:       input.description ?? null,
    status:            input.status ?? 'todo',
    priority:          input.priority ?? 'medium',
    deadline:          input.deadline ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    source:            input.source ?? null,
    source_id:         input.source_id ?? null,
  };
}

/** Replays a queued mutation. A duplicate-key error means it already landed. */
export async function replayMutation(m: QueuedMutation): Promise<void> {
  if (m.op !== 'createTask') return;
  const { error } = await supabase.from('tasks').insert(m.payload);
  if (error && error.code !== '23505') throw error;
}

export const taskService = {
  async getTasks(filter?: { status?: TaskStatus }): Promise<Task[]> {
    const user = await getUser();
    if (!user) return Promise.resolve(localTasks.getAll(filter));

    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (filter?.status) query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    return ((data as Task[]) || []).map(task => ({ ...task, tags: normalizeTags(task.tags) }));
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    const user = await getUser();
    if (!user) return Promise.resolve(localTasks.create(input));

    // Client-generated id doubles as the idempotency key for offline replays.
    const id = crypto.randomUUID();
    const row = insertRow(user.id, id, input);
    try {
      const { data, error } = await supabase.from('tasks').insert(row).select().single();
      if (error) throw error;
      return data as Task;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      enqueue('createTask', row, { key: id });
      const ts = new Date().toISOString();
      return { ...row, created_at: ts, updated_at: ts, completed_at: null } as Task;
    }
  },

  async updateTask(id: string, updates: UpdateTaskInput): Promise<Task> {
    const user = await getUser();
    if (!user) return Promise.resolve(localTasks.update(id, updates));

    const { data, error } = await supabase
      .from('tasks')
      .update({ ...updates, ...(updates.tags ? { tags: normalizeTags(updates.tags) } : {}), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Task;
  },

  async completeTask(id: string): Promise<Task> {
    const user = await getUser();
    if (!user) return Promise.resolve(localTasks.complete(id));

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: now, updated_at: now })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Task;
  },

  async deleteTask(id: string): Promise<void> {
    const user = await getUser();
    if (!user) return Promise.resolve(localTasks.delete(id));

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },
};
