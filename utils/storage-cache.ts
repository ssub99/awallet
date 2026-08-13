/**
 * Storage Cache Utilities
 * 
 * AsyncStorage 접근을 최적화하고 캐싱을 제공합니다
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class StorageCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * 캐시에서 데이터를 가져옵니다
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 캐시에 데이터를 저장합니다
   */
  private setCache<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * 캐시를 무효화합니다
   */
  private invalidateCache(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 모든 캐시를 무효화합니다
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * 캘린더 데이터를 가져옵니다 (캐시 우선)
   */
  public async getCalendarData(): Promise<any> {
    const cacheKey = 'calendarData';
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const data = storedData ? JSON.parse(storedData) : {};
      
      this.setCache(cacheKey, data);
      
      return data;
    } catch (error) {
      return {};
    }
  }

  /**
   * 캘린더 데이터를 저장합니다
   */
  public async setCalendarData(data: any): Promise<void> {
    try {
      await AsyncStorage.setItem('calendarData', JSON.stringify(data));
      this.setCache('calendarData', data);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 선택된 카테고리를 가져옵니다
   */
  public async getSelectedCategory(): Promise<string | null> {
    const cacheKey = 'selectedCategory';
    const cached = this.getFromCache(cacheKey);
    
    if (cached !== null) {
      return cached as string | null;
    }

    try {
      const data = await AsyncStorage.getItem('selectedCategory');
      this.setCache(cacheKey, data, 1 * 60 * 1000); // 1 minute TTL
      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * 선택된 카테고리를 저장합니다
   */
  public async setSelectedCategory(category: string): Promise<void> {
    try {
      await AsyncStorage.setItem('selectedCategory', category);
      this.setCache('selectedCategory', category, 1 * 60 * 1000);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 선택된 카테고리를 제거합니다
   */
  public async removeSelectedCategory(): Promise<void> {
    try {
      await AsyncStorage.removeItem('selectedCategory');
      this.invalidateCache('selectedCategory');
    } catch (error) {
    }
  }

  /**
   * 특정 날짜의 기록을 가져옵니다
   */
  public async getDateRecords(dateKey: string): Promise<any[]> {
    const calendarData = await this.getCalendarData();
    return calendarData[dateKey]?.records || [];
  }

  /**
   * 특정 날짜의 기록을 업데이트합니다
   */
  public async updateDateRecords(dateKey: string, records: any[]): Promise<void> {
    const calendarData = await this.getCalendarData();
    
    if (!calendarData[dateKey]) {
      calendarData[dateKey] = {
        totalExpense: 0,
        totalIncome: 0,
        records: []
      };
    }
    
    calendarData[dateKey].records = records;
    
    // 총액 재계산
    let totalExpense = 0;
    let totalIncome = 0;
    
    records.forEach(record => {
      if (record.type === 'expense') {
        totalExpense += record.amount || 0;
      } else if (record.type === 'income') {
        totalIncome += record.amount || 0;
      }
    });
    
    calendarData[dateKey].totalExpense = totalExpense;
    calendarData[dateKey].totalIncome = totalIncome;
    
    await this.setCalendarData(calendarData);
  }

  /**
   * 특정 recurringId를 가진 모든 기록을 찾습니다
   */
  public async findRecordsByRecurringId(recurringId: string): Promise<{dateKey: string, record: any, index: number}[]> {
    const calendarData = await this.getCalendarData();
    const results: {dateKey: string, record: any, index: number}[] = [];
    
    Object.entries(calendarData).forEach(([dateKey, data]: [string, any]) => {
      if (data.records && Array.isArray(data.records)) {
        data.records.forEach((record: any, index: number) => {
          if (record.recurringId === recurringId) {
            results.push({ dateKey, record, index });
          }
        });
      }
    });
    
    return results;
  }

  /**
   * 캐시 통계를 반환합니다
   */
  public getCacheStats(): {size: number, keys: string[]} {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 싱글톤 인스턴스
export const storageCache = new StorageCache();
