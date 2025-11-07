import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first, default to dark (cyberpunk)
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'light';
  });

  useEffect(() => {
    // Save to localStorage
    localStorage.setItem('theme', theme);
    
    // Apply theme to document
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    
    // Update CSS custom properties based on theme
    if (theme === 'dark') {
      // Cyberpunk theme
      root.style.setProperty('--background', '0 0% 5%');
      root.style.setProperty('--foreground', '120 100% 50%');
      root.style.setProperty('--card', '0 0% 8%');
      root.style.setProperty('--card-foreground', '120 100% 50%');
      root.style.setProperty('--primary', '0 0% 0%');
      root.style.setProperty('--primary-foreground', '120 100% 50%');
      root.style.setProperty('--secondary', '96 86% 56%');
      root.style.setProperty('--secondary-foreground', '0 0% 0%');
      root.style.setProperty('--muted', '0 0% 15%');
      root.style.setProperty('--muted-foreground', '120 50% 70%');
      root.style.setProperty('--accent', '96 86% 56%');
      root.style.setProperty('--accent-foreground', '0 0% 0%');
      root.style.setProperty('--border', '96 86% 56% / 0.3');
      root.style.setProperty('--input', '0 0% 10%');
      root.style.setProperty('--ring', '96 86% 56%');
    } else {
      // Light emerald theme
      root.style.setProperty('--background', '40 25% 96%');
      root.style.setProperty('--foreground', '220 13% 13%');
      root.style.setProperty('--card', '40 30% 98%');
      root.style.setProperty('--card-foreground', '220 13% 13%');
      root.style.setProperty('--primary', '158 64% 20%');
      root.style.setProperty('--primary-foreground', '40 30% 98%');
      root.style.setProperty('--secondary', '158 50% 25%');
      root.style.setProperty('--secondary-foreground', '40 30% 98%');
      root.style.setProperty('--muted', '40 20% 90%');
      root.style.setProperty('--muted-foreground', '220 9% 46%');
      root.style.setProperty('--accent', '158 64% 20%');
      root.style.setProperty('--accent-foreground', '40 30% 98%');
      root.style.setProperty('--border', '40 15% 88%');
      root.style.setProperty('--input', '40 20% 92%');
      root.style.setProperty('--ring', '158 64% 20%');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
