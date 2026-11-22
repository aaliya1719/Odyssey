import { useEffect } from 'react';
import { BASE_TITLE, formatTabTitle } from '../lib/tabAlerts';

/**
 * Mirrors the running countdown into the browser tab title, e.g.
 * "(14:25) Deep Work - Odyssey", and puts the plain title back when the timer
 * stops or the page unmounts.
 */
export function useDocumentTitleTimer(remainingSeconds: number, missionTitle: string, isRunning: boolean) {
  useEffect(() => {
    document.title = formatTabTitle(remainingSeconds, missionTitle, isRunning);
  }, [remainingSeconds, missionTitle, isRunning]);

  useEffect(() => {
    const previous = document.title;
    return () => {
      document.title = previous.startsWith('(') ? BASE_TITLE : previous;
    };
  }, []);
}
