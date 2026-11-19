import { createContext, useContext, useEffect, useState } from 'react';
import { getInitialTheme, getSystemMediaQuery, resolveTheme, storeTheme, THEME_STORAGE_KEY } from './theme';
import type { Theme } from './theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.removeAttribute('data-theme-initializing');
  }, [theme]);

  useEffect(() => {
    const syncTheme = () => {
      const nextTheme = resolveTheme();
      setTheme(currentTheme => currentTheme === nextTheme ? currentTheme : nextTheme);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) syncTheme();
    };

    const mediaQuery = getSystemMediaQuery();
    mediaQuery?.addEventListener('change', syncTheme);
    window.addEventListener('storage', handleStorage);

    syncTheme();

    return () => {
      mediaQuery?.removeEventListener('change', syncTheme);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    storeTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
