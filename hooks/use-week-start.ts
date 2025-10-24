/**
 * Use Week Start Hook
 * 
 * Manages week start preference (Sunday or Monday)
 * Reads from AsyncStorage and provides utility functions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface WeekStartConfig {
  /**
   * Whether week starts on Sunday
   * true = Sunday start, false = Monday start
   */
  startsSunday: boolean;
  
  /**
   * Weekday labels based on week start preference
   * Sunday start: ['일', '월', '화', '수', '목', '금', '토']
   * Monday start: ['월', '화', '수', '목', '금', '토', '일']
   */
  weekdays: string[];
  
  /**
   * Adjust first day of week for calendar rendering
   * Converts JavaScript Date.getDay() (0=Sunday) to calendar grid offset
   */
  adjustFirstDayOfWeek: (jsDay: number) => number;
}

const WEEKDAYS_SUNDAY_START = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_MONDAY_START = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * Event emitter for week start preference changes
 */
class WeekStartEventEmitter {
  private listeners: Array<(startsSunday: boolean) => void> = [];

  subscribe(listener: (startsSunday: boolean) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(startsSunday: boolean): void {
    this.listeners.forEach(listener => listener(startsSunday));
  }
}

export const weekStartEvent = new WeekStartEventEmitter();

/**
 * Custom hook to manage week start preference
 */
export function useWeekStart(): WeekStartConfig {
  const [startsSunday, setStartsSunday] = useState(true); // Default: Sunday start

  // Load preference from AsyncStorage
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const value = await AsyncStorage.getItem('weekStartsSunday');
        if (value !== null) {
          const parsed = JSON.parse(value);
          setStartsSunday(parsed);

        }
      } catch (error) {

      }
    };

    loadPreference();

    // Listen for changes from other components
    const unsubscribe = weekStartEvent.subscribe((newValue) => {

      setStartsSunday(newValue);
    });

    return unsubscribe;
  }, []);

  // Adjust first day of week for calendar grid
  const adjustFirstDayOfWeek = (jsDay: number): number => {
    if (startsSunday) {
      // Sunday start: use JavaScript Date.getDay() as-is (0=Sun, 6=Sat)
      return jsDay;
    } else {
      // Monday start: shift by -1 (Mon=0, Sun=6)
      // JavaScript: 0=Sun, 1=Mon, ..., 6=Sat
      // We want:    6=Sun, 0=Mon, ..., 5=Sat
      return jsDay === 0 ? 6 : jsDay - 1;
    }
  };

  return {
    startsSunday,
    weekdays: startsSunday ? WEEKDAYS_SUNDAY_START : WEEKDAYS_MONDAY_START,
    adjustFirstDayOfWeek,
  };
}

/**
 * Get weekday label for a given date
 * 
 * @param year Year
 * @param month Month (1-12)
 * @param day Day
 * @param startsSunday Whether week starts on Sunday
 * @returns Weekday label (일, 월, 화, ...)
 */
export function getWeekdayLabel(
  year: number,
  month: number,
  day: number,
  startsSunday: boolean = true
): string {
  const date = new Date(year, month - 1, day);
  const jsDay = date.getDay(); // 0=Sunday, 6=Saturday
  
  // Always use Sunday-start order for actual days
  // This is for display only, not calendar layout
  const weekdays = WEEKDAYS_SUNDAY_START;
  return weekdays[jsDay];
}

