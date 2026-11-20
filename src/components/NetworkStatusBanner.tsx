import { useEffect, useState } from 'react';
import { flushQueue, pendingCount, subscribe } from '../lib/mutationQueue';
import { replayMutation } from '../services/taskService';

/**
 * Small pill showing offline state and queue replay progress. Also owns the
 * `online` listener that flushes the mutation queue.
 */
export default function NetworkStatusBanner() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [pending, setPending] = useState(() => pendingCount());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const flush = async () => {
      if (pendingCount() === 0) return;
      const res = await flushQueue(replayMutation);
      if (cancelled) return;
      setPending(res.remaining);
      if (res.retryInMs !== null) timer = setTimeout(flush, res.retryInMs);
    };
    const goOnline = () => { setOnline(true); clearTimeout(timer); void flush(); };
    const goOffline = () => { setOnline(false); clearTimeout(timer); };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsub = subscribe(() => setPending(pendingCount()));
    if (navigator.onLine) void flush();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsub();
    };
  }, []);

  if (online && pending === 0) return null;

  const text = !online
    ? 'Offline — changes saved locally'
    : `Reconnected — syncing ${pending} ${pending === 1 ? 'item' : 'items'}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full border border-white/15 bg-black/70 px-4 py-1.5 text-xs text-white backdrop-blur"
    >
      {text}
    </div>
  );
}
