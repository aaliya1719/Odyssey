import { describe, expect, it } from 'vitest';
import { getStoredTheme, resolveTheme, storeTheme } from './theme';
import indexHtml from '../../index.html?raw';

const themeInitScriptMatch = indexHtml.match(/<script data-theme-init>([\s\S]*?)<\/script>/);

if (!themeInitScriptMatch) throw new Error('Theme initialization script is missing from index.html');

const themeInitScript = themeInitScriptMatch[1];

function runThemeInit(storage: Storage, prefersDark: boolean, supportsMedia = true) {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  const window = {
    localStorage: storage,
    matchMedia: supportsMedia ? () => ({ matches: prefersDark }) : undefined,
  };

  new Function('document', 'window', themeInitScript)(document, window);
  return document.documentElement.dataset;
}

function createStorage(initialValue: string | null, shouldThrow = false): Storage {
  let value = initialValue;
  return {
    getItem: () => {
      if (shouldThrow) throw new Error('blocked');
      return value;
    },
    setItem: (_key, nextValue) => { value = nextValue; },
    removeItem: () => { value = null; },
    clear: () => { value = null; },
    key: () => null,
    length: 0,
  };
}

describe('initial theme resolution', () => {
  it.each([
    ['light', false, 'light'],
    ['dark', false, 'dark'],
    [null, false, 'light'],
    [null, true, 'dark'],
    ['invalid', true, 'dark'],
  ])('uses saved preference or system fallback (%s, system dark: %s)', (saved, prefersDark, expected) => {
    expect(runThemeInit(createStorage(saved), prefersDark).theme).toBe(expected);
  });

  it('continues with the system preference when storage access is blocked', () => {
    expect(runThemeInit(createStorage(null, true), false).theme).toBe('light');
  });

  it('keeps the dark fallback when matchMedia is unavailable', () => {
    expect(runThemeInit(createStorage(null), false, false).theme).toBe('dark');
  });
});

describe('theme persistence', () => {
  it('reads only valid saved themes and writes toggle values safely', () => {
    const storage = createStorage('light');
    expect(getStoredTheme(storage)).toBe('light');
    storeTheme('dark', storage);
    expect(getStoredTheme(storage)).toBe('dark');
  });

  it('falls back to dark when no browser storage or system API exists', () => {
    expect(resolveTheme()).toBe('dark');
  });
});
