/**
 * Offline mutation queue.
 *
 * Writes that fail because the network is down are stored here (localStorage)
 * and replayed in FIFO order once the browser is back online. Each entry has an
 * idempotency key, so a replay that already reached the server is harmless.
 */

export interface QueuedMutation {
  /** Idempotency key. Also used as the entity id for creates. */
  key: string;
  op: string;
  payload: Record<string, unknown>;
  /** ISO timestamp of when the user made the change. */
  queuedAt: string;
  attempts: number;
}

export type MutationExecutor = (m: QueuedMutation) => Promise<void>;

export interface QueueStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const STORAGE_KEY = 'ody_mutation_queue';
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60_000;

function defaultStorage(): QueueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadQueue(storage: QueueStorage | null = defaultStorage()): QueuedMutation[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedMutation[], storage: QueueStorage | null): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // quota or private mode: nothing more we can do
  }
}

/** Adds a mutation. A second enqueue with the same key is ignored. */
export function enqueue(
  op: string,
  payload: Record<string, unknown>,
  opts: { key?: string; storage?: QueueStorage | null; now?: () => Date } = {},
): QueuedMutation {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const queue = loadQueue(storage);
  const key = opts.key ?? crypto.randomUUID();
  const existing = queue.find(m => m.key === key);
  if (existing) return existing;
  const entry: QueuedMutation = {
    key,
    op,
    payload,
    queuedAt: (opts.now?.() ?? new Date()).toISOString(),
    attempts: 0,
  };
  saveQueue([...queue, entry], storage);
  notify();
  return entry;
}

export function pendingCount(storage: QueueStorage | null = defaultStorage()): number {
  return loadQueue(storage).length;
}

/** Exponential backoff: 1s, 2s, 4s ... capped at 60s. */
export function backoffDelay(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts));
}

/** True for fetch-level failures, false for errors the server actually answered. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((err as { message?: unknown })?.message ?? err ?? '');
  return /failed to fetch|networkerror|network request failed|load failed/i.test(msg);
}

export interface FlushResult {
  done: number;
  remaining: number;
  /** Set when a replay failed; wait this long before trying again. */
  retryInMs: number | null;
}

/**
 * Replays the queue oldest first. Stops at the first failure so ordering is
 * preserved, and bumps that entry's attempt counter for the backoff.
 */
export async function flushQueue(
  execute: MutationExecutor,
  storage: QueueStorage | null = defaultStorage(),
): Promise<FlushResult> {
  let queue = loadQueue(storage);
  let done = 0;
  while (queue.length > 0) {
    const head = queue[0];
    try {
      await execute(head);
    } catch {
      queue = [{ ...head, attempts: head.attempts + 1 }, ...queue.slice(1)];
      saveQueue(queue, storage);
      notify();
      return { done, remaining: queue.length, retryInMs: backoffDelay(head.attempts) };
    }
    queue = queue.slice(1);
    saveQueue(queue, storage);
    done++;
  }
  notify();
  return { done, remaining: 0, retryInMs: null };
}

/**
 * Last-write-wins. The local change only wins when it is strictly newer than
 * the cloud record, so an older queued edit can never clobber newer cloud data.
 */
export function resolveLww<T extends { updated_at?: string | null; completed_at?: string | null }>(
  local: T,
  remote: T | null | undefined,
): 'local' | 'remote' {
  if (!remote) return 'local';
  const stamp = (r: T) => Date.parse(r.updated_at ?? r.completed_at ?? '') || 0;
  return stamp(local) > stamp(remote) ? 'local' : 'remote';
}

// ─── Change subscription (for the status banner) ─────────────────────────────

const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify(): void {
  listeners.forEach(fn => fn());
}
