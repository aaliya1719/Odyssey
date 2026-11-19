export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'odyssey-theme';
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getStoredTheme(storage: Storage | null = getStorage()): Theme | null {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme, storage: Storage | null = getStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

export function getSystemMediaQuery(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DARK_SCHEME_QUERY)
      : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  const mediaQuery = getSystemMediaQuery();
  if (!mediaQuery) return 'dark';
  return mediaQuery.matches ? 'dark' : 'light';
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function getInitialTheme(): Theme {
  const initialTheme = typeof document !== 'undefined' ? document.documentElement.dataset.theme : null;
  return initialTheme === 'light' || initialTheme === 'dark' ? initialTheme : resolveTheme();
}
