import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { ThemeMode, applyTheme, getInitialTheme } from '../utils/theme';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      onClick={toggle}
      type="button"
      className={`p-2 rounded-xl border shadow-xs flex items-center justify-center cursor-pointer transition-colors ${
        theme === 'light'
          ? 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
          : 'bg-stone-800 text-amber-400 border-stone-700 hover:bg-stone-700'
      } ${className}`}
      title={theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      aria-label="Alternar tema de cores"
    >
      {theme === 'light' ? (
        <Moon className="w-4 h-4 transition-transform -rotate-12 hover:rotate-0" />
      ) : (
        <Sun className="w-4 h-4 text-amber-400 transition-transform hover:rotate-45" />
      )}
    </button>
  );
};
