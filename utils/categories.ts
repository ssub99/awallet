/**
 * Categories Utility (Unified)
 *
 * - 통합 카테고리 관리 (기본 + 사용자)
 * - 초기 실행 시 기본 카테고리를 AsyncStorage에 저장하여 편집/삭제 가능하도록 마이그레이션
 * - 이후 모든 카테고리 CRUD는 이 유틸을 거쳐서 수행
 */

import {
  type Category,
  type CategoryType,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/constants/categories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadUserCategories } from './user-categories';

const CATEGORY_STORAGE_PREFIX = 'categories_';
const MIGRATION_FLAG_KEY = 'categories_migration_done';

const categoriesMemoryCache: Record<CategoryType, Category[] | undefined> = {
  expense: undefined,
  income: undefined,
};

let categoriesMigrationSessionDone = false;

const getStorageKey = (type: CategoryType): string => `${CATEGORY_STORAGE_PREFIX}${type}`;

export interface LoadCategoriesOptions {
  /** true면 메모리 캐시를 무시하고 Storage에서 읽음 */
  forceStorage?: boolean;
}

export function getCategoriesMemoryCache(type: CategoryType): Category[] | null {
  const cached = categoriesMemoryCache[type];
  return cached ?? null;
}

function commitCategoriesCache(type: CategoryType, categories: Category[]): Category[] {
  categoriesMemoryCache[type] = categories;
  return categories;
}

export function areCategoriesSame(a: Category[], b: Category[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) {
      return false;
    }
    if (left.label !== right.label || left.emoji !== right.emoji || left.type !== right.type) {
      return false;
    }
  }
  return true;
}

/**
 * 타입별 기본 카테고리 (코드 정의)
 */
const getBuiltInCategories = (type: CategoryType): Category[] => {
  return type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
};

async function ensureCategoriesMigration(): Promise<void> {
  if (categoriesMigrationSessionDone) {
    return;
  }
  await migrateCategoriesIfNeeded();
  categoriesMigrationSessionDone = true;
}

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
      }),
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
export async function loadCategories(
  type: CategoryType,
  options?: LoadCategoriesOptions,
): Promise<Category[]> {
  const forceStorage = options?.forceStorage === true;
  if (!forceStorage && categoriesMemoryCache[type] !== undefined) {
    return categoriesMemoryCache[type]!;
  }

  try {
    await ensureCategoriesMigration();

    const storageKey = getStorageKey(type);
    const stored = await AsyncStorage.getItem(storageKey);
    const builtIn = getBuiltInCategories(type);
    const builtInLabels = new Set(builtIn.map((cat) => cat.label));

    if (stored) {
      const parsed = JSON.parse(stored) as Category[];
      if (Array.isArray(parsed)) {
        const hasBuiltInCategories =
          builtIn.length > 0 && parsed.some((cat) => builtInLabels.has(cat.label));

        if (parsed.length === 0 || !hasBuiltInCategories) {
          const legacyUserCategories = await loadUserCategories(type);
          const userCreatedCategories = parsed.filter((cat) => !builtInLabels.has(cat.label));
          const merged = [...builtIn, ...userCreatedCategories, ...legacyUserCategories];
          await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
          return commitCategoriesCache(type, merged);
        }

        return commitCategoriesCache(type, parsed);
      }
    }

    const legacyUserCategories = await loadUserCategories(type);
    const merged = [...builtIn, ...legacyUserCategories];
    await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
    return commitCategoriesCache(type, merged);
  } catch (error) {
    console.error('[categories] Failed to load categories:', error);
    const builtInFallback = getBuiltInCategories(type);
    return commitCategoriesCache(type, builtInFallback);
  }
}

/**
 * 통합 카테고리 저장
 */
export async function saveCategories(type: CategoryType, categories: Category[]): Promise<void> {
  try {
    const storageKey = getStorageKey(type);
    await AsyncStorage.setItem(storageKey, JSON.stringify(categories));
    commitCategoriesCache(type, categories);
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
