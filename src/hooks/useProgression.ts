import { useEffect, useMemo, useState } from 'react';
import { calculateProgression } from '../lib/progressionEngine';
import type { ProgressionHistory } from '../lib/progressionEngine';
const KEY = 'odyssey-rest-days';
function readRestDays(): number[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(value) && value.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) return value;
  } catch { /* Restricted storage uses the weekend default. */ }
  return [0, 6];
}
export function useProgression({ tasks, missions, sessions }: ProgressionHistory) {
  const [now, setNow] = useState(Date.now), [restDays, setRestDays] = useState(readRestDays);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const sync = (event: StorageEvent) => { if (event.key === KEY || event.key === null) setRestDays(readRestDays()); };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); window.addEventListener('storage', sync);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('storage', sync); };
  }, []);
  const progress = useMemo(() => calculateProgression({ tasks, missions, sessions }, { now, restDays }), [tasks, missions, sessions, now, restDays]);
  function configureRestDays(days: number[]) {
    setRestDays(days);
    try { localStorage.setItem(KEY, JSON.stringify(days)); } catch { /* The current view still honors the selection. */ }
  }
  return { progress, configureRestDays };
}
