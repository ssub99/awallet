import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export const KEYPAD_HAPTICS_ENABLED_KEY = 'keypadHapticsEnabled';
const DEFAULT_KEYPAD_HAPTICS_ENABLED = false;

class KeypadHapticsEventEmitter {
  private listeners: ((enabled: boolean) => void)[] = [];

  subscribe(listener: (enabled: boolean) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(enabled: boolean): void {
    this.listeners.forEach((listener) => listener(enabled));
  }
}

export const keypadHapticsEvent = new KeypadHapticsEventEmitter();

export async function loadKeypadHapticsEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEYPAD_HAPTICS_ENABLED_KEY);
    return value === null ? DEFAULT_KEYPAD_HAPTICS_ENABLED : JSON.parse(value);
  } catch {
    return DEFAULT_KEYPAD_HAPTICS_ENABLED;
  }
}

export async function saveKeypadHapticsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYPAD_HAPTICS_ENABLED_KEY, JSON.stringify(enabled));
  keypadHapticsEvent.emit(enabled);
}

export function useKeypadHapticsEnabled(): boolean {
  const [enabled, setEnabled] = useState(DEFAULT_KEYPAD_HAPTICS_ENABLED);

  useEffect(() => {
    let mounted = true;

    loadKeypadHapticsEnabled().then((value) => {
      if (mounted) {
        setEnabled(value);
      }
    });

    const unsubscribe = keypadHapticsEvent.subscribe(setEnabled);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return enabled;
}
