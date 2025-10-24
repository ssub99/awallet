/**
 * Use Month Start Hook
 * 
 * Manages month start day setting
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const MONTH_START_DAY_KEY = 'monthStartDay';

/**
 * Load month start day from AsyncStorage
 * 
 * @returns Month start day (1-31)
 */
export async function loadMonthStartDay(): Promise<number> {
  try {
    const saved = await AsyncStorage.getItem(MONTH_START_DAY_KEY);
    if (saved) {
      // Extract number from saved value (e.g., "1일" -> 1)
      const dayNumber = parseInt(saved.replace('일', ''));
      if (!isNaN(dayNumber) && dayNumber >= 1 && dayNumber <= 31) {
        return dayNumber;
      }
    }
  } catch (error) {

  }
  
  return 1; // Default
}

