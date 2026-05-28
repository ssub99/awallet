/**
 * Category Order Utility
 *
 * Utilities for loading and applying saved category order from AsyncStorage.
 */

import { type Category, type CategoryType } from '@/constants/categories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCategoriesMemoryCache } from '@/utils/categories';

const categoryOrderMemoryCache: Record<CategoryType, string[] | null | undefined> = {
  expense: undefined,
  income: undefined,
};

export interface LoadCategoryOrderOptions {
  /** true면 메모리 캐시를 무시하고 Storage에서 읽음 */
  forceStorage?: boolean;
}

function commitCategoryOrderCache(type: CategoryType, order: string[] | null): string[] | null {
  categoryOrderMemoryCache[type] = order;
  return order;
}

export function getCategoryOrderMemoryCache(type: CategoryType): string[] | null | undefined {
  return categoryOrderMemoryCache[type];
}

/**
 * 카테고리·순서 캐시가 모두 있을 때 표시용 목록 반환
 */
export function getOrderedCategoriesFromCache(type: CategoryType): Category[] | null {
  const categories = getCategoriesMemoryCache(type);
  if (!categories) {
    return null;
  }
  const savedOrder = getCategoryOrderMemoryCache(type);
  if (savedOrder === undefined) {
    return null;
  }
  if (savedOrder && savedOrder.length > 0) {
    return applySavedOrder(categories, savedOrder);
  }
  return categories;
}

/**
 * 저장된 카테고리 순서 불러오기
 */
export async function loadCategoryOrder(
  type: CategoryType,
  options?: LoadCategoryOrderOptions,
): Promise<string[] | null> {
  const forceStorage = options?.forceStorage === true;
  if (!forceStorage && categoryOrderMemoryCache[type] !== undefined) {
    return categoryOrderMemoryCache[type] ?? null;
  }

  try {
    const storageKey = `categoryOrder_${type}`;
    const savedOrder = await AsyncStorage.getItem(storageKey);
    const parsed = savedOrder ? (JSON.parse(savedOrder) as string[]) : null;
    return commitCategoryOrderCache(type, parsed);
  } catch (error) {
    console.error('카테고리 순서 불러오기 실패:', error);
    return commitCategoryOrderCache(type, null);
  }
}

/**
 * 저장된 순서에 따라 카테고리 정렬
 */
export function applySavedOrder(categories: Category[], savedOrder: string[]): Category[] {
  const orderedCategories: Category[] = [];
  const categoryMap = new Map(categories.map((cat) => [cat.label, cat]));

  savedOrder.forEach((label) => {
    const category = categoryMap.get(label);
    if (category) {
      orderedCategories.push(category);
      categoryMap.delete(label);
    }
  });

  categoryMap.forEach((category) => {
    orderedCategories.push(category);
  });

  return orderedCategories;
}

/**
 * 카테고리 순서 저장하기
 */
export async function saveCategoryOrder(
  type: CategoryType,
  orderedCategories: Category[],
): Promise<void> {
  try {
    const storageKey = `categoryOrder_${type}`;
    const order = orderedCategories.map((cat) => cat.label);
    await AsyncStorage.setItem(storageKey, JSON.stringify(order));
    commitCategoryOrderCache(type, order);
  } catch (error) {
    console.error('카테고리 순서 저장 실패:', error);
    throw error;
  }
}
