/**
 * Helpers for keeping a running focus session visible from other browser tabs:
 * a live countdown in the document title and a desktop notification when time is up.
 * Everything here is pure or takes its environment as an argument, so it can be tested
 * without a browser.
 */

export const BASE_TITLE = 'Odyssey';

/** mm:ss, or h:mm:ss from one hour up. Negative and fractional input is clamped and floored. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "(14:25) Deep Work - Odyssey" while running, plain "Odyssey" otherwise. */
export function formatTabTitle(remainingSeconds: number, missionTitle: string, isRunning: boolean): string {
  if (!isRunning) return BASE_TITLE;
  const name = missionTitle.trim();
  const clock = `(${formatClock(remainingSeconds)})`;
  return name ? `${clock} ${name} - ${BASE_TITLE}` : `${clock} ${BASE_TITLE}`;
}

/** The minimal slice of the Web Notifications API this app relies on. */
export interface NotificationLike {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): unknown;
}

export function getNotificationApi(): NotificationLike | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  return window.Notification as unknown as NotificationLike;
}

export function canNotify(api: NotificationLike | null): boolean {
  return api !== null && api.permission === 'granted';
}

/** True when the app can still ask: the API exists and the user hasn't answered yet. */
export function canAskForPermission(api: NotificationLike | null): boolean {
  return api !== null && api.permission === 'default';
}

/** Only worth interrupting the user when they are not looking at this tab. */
export function shouldNotifyTimeUp(opts: { documentHidden: boolean; api: NotificationLike | null }): boolean {
  return opts.documentHidden && canNotify(opts.api);
}

export function timeUpNotificationContent(missionTitle: string): { title: string; body: string } {
  const name = missionTitle.trim() || 'your mission';
  return {
    title: 'Mission Accomplished!',
    body: `Your focus interval on '${name}' is complete. Time to debrief or rest.`,
  };
}

/**
 * Shows the time-up notification when the tab is hidden and permission is granted.
 * Returns true if one was created. Never throws: some browsers (notably on Android)
 * throw from `new Notification` even when permission is granted.
 */
export function notifyTimeUp(
  missionTitle: string,
  opts: { documentHidden: boolean; api: NotificationLike | null },
): boolean {
  if (!shouldNotifyTimeUp(opts) || !opts.api) return false;
  try {
    const { title, body } = timeUpNotificationContent(missionTitle);
    new opts.api(title, { body });
    return true;
  } catch {
    return false;
  }
}

/** Asks for permission if it is still undecided. Resolves to the final permission, or null if unsupported. */
export async function requestNotificationPermission(
  api: NotificationLike | null,
): Promise<NotificationPermission | null> {
  if (!api) return null;
  if (api.permission !== 'default') return api.permission;
  try {
    return await api.requestPermission();
  } catch {
    return api.permission;
  }
}
