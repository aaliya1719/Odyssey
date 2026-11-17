/**
 * Wrap an async action so a second call made while the first is still running is
 * ignored (it resolves to undefined) instead of starting a second copy.
 * Used for Start/Resume, where a double click or a repeated shortcut would
 * otherwise open two focus sessions.
 */
export function singleFlight<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<T | undefined> {
  let busy = false;
  return async (...args: Args) => {
    if (busy) return undefined;
    busy = true;
    try {
      return await action(...args);
    } finally {
      busy = false;
    }
  };
}
