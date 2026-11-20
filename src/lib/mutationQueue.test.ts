import { describe, expect, it, vi } from 'vitest';
import {
  backoffDelay, enqueue, flushQueue, isNetworkError, loadQueue, pendingCount, resolveLww,
  type QueueStorage,
} from './mutationQueue';

function memStorage(): QueueStorage {
  const data = new Map<string, string>();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('enqueue', () => {
  it('serializes entries in order and survives a reload', () => {
    const s = memStorage();
    enqueue('createTask', { title: 'a' }, { key: 'k1', storage: s, now: () => new Date('2026-01-01T00:00:00Z') });
    enqueue('createTask', { title: 'b' }, { key: 'k2', storage: s });
    const q = loadQueue(s);
    expect(q.map(m => m.key)).toEqual(['k1', 'k2']);
    expect(q[0].queuedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(pendingCount(s)).toBe(2);
  });

  it('ignores a duplicate idempotency key', () => {
    const s = memStorage();
    enqueue('createTask', { title: 'a' }, { key: 'k1', storage: s });
    enqueue('createTask', { title: 'changed' }, { key: 'k1', storage: s });
    expect(loadQueue(s)).toHaveLength(1);
    expect(loadQueue(s)[0].payload.title).toBe('a');
  });

  it('tolerates corrupt storage', () => {
    const s = memStorage();
    s.setItem('ody_mutation_queue', '{nope');
    expect(loadQueue(s)).toEqual([]);
  });
});

describe('flushQueue', () => {
  it('replays FIFO and empties the queue', async () => {
    const s = memStorage();
    enqueue('x', {}, { key: 'a', storage: s });
    enqueue('x', {}, { key: 'b', storage: s });
    const seen: string[] = [];
    const res = await flushQueue(async m => { seen.push(m.key); }, s);
    expect(seen).toEqual(['a', 'b']);
    expect(res).toEqual({ done: 2, remaining: 0, retryInMs: null });
    expect(pendingCount(s)).toBe(0);
  });

  it('stops at the first failure, keeps order and backs off', async () => {
    const s = memStorage();
    enqueue('x', {}, { key: 'a', storage: s });
    enqueue('x', {}, { key: 'b', storage: s });
    const exec = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const first = await flushQueue(exec, s);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ done: 0, remaining: 2, retryInMs: 1000 });
    const second = await flushQueue(exec, s);
    expect(second.retryInMs).toBe(2000);
    expect(loadQueue(s).map(m => m.key)).toEqual(['a', 'b']);
  });

  it('replaying the same key twice is safe with an idempotent executor', async () => {
    const s = memStorage();
    const server = new Set<string>();
    const exec = async (m: { key: string }) => { server.add(m.key); };
    enqueue('create', { id: 'k1' }, { key: 'k1', storage: s });
    await flushQueue(exec, s);
    enqueue('create', { id: 'k1' }, { key: 'k1', storage: s });
    await flushQueue(exec, s);
    expect(server.size).toBe(1);
  });
});

describe('backoffDelay', () => {
  it('doubles and caps at 60s', () => {
    expect([0, 1, 2, 3].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffDelay(20)).toBe(60000);
  });
});

describe('isNetworkError', () => {
  it('recognises fetch failures but not server errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ message: 'duplicate key value violates unique constraint' })).toBe(false);
  });
});

describe('resolveLww', () => {
  const older = { updated_at: '2026-01-01T00:00:00Z' };
  const newer = { updated_at: '2026-01-02T00:00:00Z' };
  it('local wins only when strictly newer', () => {
    expect(resolveLww(newer, older)).toBe('local');
    expect(resolveLww(older, newer)).toBe('remote');
    expect(resolveLww(older, { ...older })).toBe('remote');
  });
  it('local wins when there is no remote record', () => {
    expect(resolveLww(older, null)).toBe('local');
  });
  it('falls back to completed_at', () => {
    expect(resolveLww({ completed_at: '2026-03-01T00:00:00Z' }, { updated_at: '2026-02-01T00:00:00Z' })).toBe('local');
  });
});
