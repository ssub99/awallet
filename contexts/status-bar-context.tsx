import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { StatusBar as ExpoStatusBar, type StatusBarStyle } from 'expo-status-bar';
import { Platform } from 'react-native';

interface AppStatusBarContextValue {
  setAndroidStatusBarStyle: (style: StatusBarStyle) => void;
}

const AppStatusBarContext = createContext<AppStatusBarContextValue | null>(null);

export function AppStatusBarProvider({ children }: { children: ReactNode }) {
  const [androidStatusBarStyle, setAndroidStatusBarStyleState] =
    useState<StatusBarStyle>('dark');

  const setAndroidStatusBarStyle = useCallback((style: StatusBarStyle) => {
    setAndroidStatusBarStyleState(style);
  }, []);

  const value = useMemo(
    () => ({ setAndroidStatusBarStyle }),
    [setAndroidStatusBarStyle],
  );

  return (
    <AppStatusBarContext.Provider value={value}>
      {Platform.OS === 'android' ? (
        <ExpoStatusBar
          style={androidStatusBarStyle}
          translucent
          backgroundColor="transparent"
        />
      ) : null}
      {children}
    </AppStatusBarContext.Provider>
  );
}

export function useAppStatusBar() {
  const value = useContext(AppStatusBarContext);
  if (value == null) {
    throw new Error('useAppStatusBar must be used within AppStatusBarProvider');
  }
  return value;
}
