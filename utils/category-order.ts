/**
 * Category Order Utility
 * 
 * Utilities for loading and applying saved category order from AsyncStorage.
 */

import { type Category, type CategoryType } from '@/constants/categories';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 저장된 카테고리 순서 불러오기
 */
export async function loadCategoryOrder(type: CategoryType): Promise<string[] | null> {
  try {
    const storageKey = `categoryOrder_${type}`;
    const savedOrder = await AsyncStorage.getItem(storageKey);
    return savedOrder ? JSON.parse(savedOrder) : null;
  } catch (error) {
    console.error('카테고리 순서 불러오기 실패:', error);
    return null;
  }
}

/**
 * 저장된 순서에 따라 카테고리 정렬
 */
export function applySavedOrder(
  categories: Category[],
  savedOrder: string[]
): Category[] {
  // 저장된 순서에 따라 정렬
  const orderedCategories: Category[] = [];
  const categoryMap = new Map(categories.map(cat => [cat.label, cat]));
  
  // 저장된 순서대로 추가
  savedOrder.forEach(label => {
    const category = categoryMap.get(label);
    if (category) {
      orderedCategories.push(category);
      categoryMap.delete(label);
    }
  });
  
  // 저장된 순서에 없는 새 카테고리들을 끝에 추가
  categoryMap.forEach(category => {
    orderedCategories.push(category);
  });
  
  return orderedCategories;
}

/**
 * 카테고리 순서 저장하기
 */
export async function saveCategoryOrder(
  type: CategoryType,
  orderedCategories: Category[]
): Promise<void> {
  try {
    const storageKey = `categoryOrder_${type}`;
    const order = orderedCategories.map(cat => cat.label);
    await AsyncStorage.setItem(storageKey, JSON.stringify(order));
  } catch (error) {
    console.error('카테고리 순서 저장 실패:', error);
    throw error;
  }
}
