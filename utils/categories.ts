/**
 * Categories Utility (Unified)
 *
 * - 통합 카테고리 관리 (기본 + 사용자)
 * - 초기 실행 시 기본 카테고리를 AsyncStorage에 저장하여 편집/삭제 가능하도록 마이그레이션
 * - 이후 모든 카테고리 CRUD는 이 유틸을 거쳐서 수행
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type Category,
  type CategoryType,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/constants/categories';
import { loadUserCategories } from './user-categories';

const CATEGORY_STORAGE_PREFIX = 'categories_';
const MIGRATION_FLAG_KEY = 'categories_migration_done';

const getStorageKey = (type: CategoryType): string => `${CATEGORY_STORAGE_PREFIX}${type}`;

/**
 * 타입별 기본 카테고리 (코드 정의)
 */
const getBuiltInCategories = (type: CategoryType): Category[] => {
  return type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
};

/**
 * 마이그레이션: 통합 스토리지에 카테고리 저장
 * - 최초 1회만 실행 (flag 저장)
 * - 기존 사용자 카테고리(userCategories_*)를 함께 병합
 */
export async function migrateCategoriesIfNeeded(): Promise<void> {
  try {
    const migrated = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (migrated === 'true') {
      return;
    }

    const types: CategoryType[] = ['expense', 'income'];

    await Promise.all(
      types.map(async (type) => {
        const storageKey = getStorageKey(type);
        const existing = await AsyncStorage.getItem(storageKey);
        if (existing) {
          return;
        }

        const builtIn = getBuiltInCategories(type);
        const legacyUserCategories = await loadUserCategories(type);
        const merged = [...builtIn, ...legacyUserCategories];

        await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
      })
    );

    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
  } catch (error) {
    console.error('[categories] Migration failed:', error);
    // 마이그레이션 실패 시 앱 동작은 계속되어야 하므로 에러만 로그
  }
}

/**
 * 통합 카테고리 불러오기 (마이그레이션 포함)
 */
export async function loadCategories(type: CategoryType): Promise<Category[]> {
  try {
    await migrateCategoriesIfNeeded();

    const storageKey = getStorageKey(type);
    const stored = await AsyncStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Category[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    // 저장된 값이 없거나 파싱 실패 시 기본 + 사용자(레거시) 조합 반환
    const builtIn = getBuiltInCategories(type);
    const legacyUserCategories = await loadUserCategories(type);
    const merged = [...builtIn, ...legacyUserCategories];
    await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.error('[categories] Failed to load categories:', error);
    // 에러 시에도 최소한 기본 카테고리는 반환
    const builtInFallback = getBuiltInCategories(type);
    return builtInFallback;
  }
}

/**
 * 통합 카테고리 저장
 */
export async function saveCategories(
  type: CategoryType,
  categories: Category[]
): Promise<void> {
  try {
    const storageKey = getStorageKey(type);
    await AsyncStorage.setItem(storageKey, JSON.stringify(categories));
  } catch (error) {
    console.error('[categories] Failed to save categories:', error);
    throw error;
  }
}

/**
 * 통합 카테고리 전체 조회 (expense + income)
 */
export async function loadAllCategories(): Promise<Category[]> {
  const [expense, income] = await Promise.all([
    loadCategories('expense'),
    loadCategories('income'),
  ]);
  return [...expense, ...income];
}

