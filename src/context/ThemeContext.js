import React, { createContext, useMemo } from 'react';

const LIGHT_COLORS = {
  background: '#F6F6F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F0EB',
  text: '#111111',
  muted: '#74746D',
  border: '#E4E4DE',
  yellow: '#FFFC00',
};

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const value = useMemo(() => ({
    preference: 'light',
    activeScheme: 'light',
    isDark: false,
    colors: LIGHT_COLORS,
    setPreference: async () => {},
  }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
};
