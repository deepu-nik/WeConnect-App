import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, useColorScheme } from 'react-native';

const STORAGE_KEY = 'weconnect_theme_preference';

const PALETTES = {
  light: {
    background: '#F6F6F2',
    surface: '#FFFFFF',
    surfaceMuted: '#F0F0EB',
    text: '#111111',
    muted: '#74746D',
    border: '#E4E4DE',
    yellow: '#FFFC00',
  },
  dark: {
    background: '#10100F',
    surface: '#1B1B19',
    surfaceMuted: '#252521',
    text: '#F5F5EF',
    muted: '#A7A79F',
    border: '#35352F',
    yellow: '#FFFC00',
  },
};

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme() || 'light';
  const [preference, setPreference] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'light' || value === 'dark' || value === 'system') setPreference(value);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  }, [preference]);

  const activeScheme = preference === 'system' ? systemScheme : preference;
  const colors = PALETTES[activeScheme];

  const value = useMemo(() => ({
    preference,
    activeScheme,
    isDark: activeScheme === 'dark',
    colors,
    setPreference: async (next) => {
      if (!['light', 'dark', 'system'].includes(next)) return;
      setPreference(next);
      await AsyncStorage.setItem(STORAGE_KEY, next);
    },
  }), [preference, activeScheme, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
};
