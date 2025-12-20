/**
 * User Categories Utility
 * 
 * Utilities for managing user-created categories stored in AsyncStorage.
 */

import { type Category, type CategoryType } from '@/constants/categories';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'userCategories_';

/**
 * 사용자 카테고리 불러오기
 */
export async function loadUserCategories(type: CategoryType): Promise<Category[]> {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${type}`;
    const savedCategories = await AsyncStorage.getItem(storageKey);
    return savedCategories ? JSON.parse(savedCategories) : [];
  } catch (error) {
    console.error('사용자 카테고리 불러오기 실패:', error);
    return [];
  }
}

/**
 * 사용자 카테고리 저장하기
 */
export async function saveUserCategories(
  type: CategoryType,
  categories: Category[]
): Promise<void> {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${type}`;
    await AsyncStorage.setItem(storageKey, JSON.stringify(categories));
  } catch (error) {
    console.error('사용자 카테고리 저장 실패:', error);
    throw error;
  }
}

/**
 * 사용자 카테고리 추가하기
 */
export async function addUserCategory(category: Category): Promise<void> {
  try {
    const existingCategories = await loadUserCategories(category.type);
    
    // 중복 체크 (같은 이름의 카테고리가 있는지)
    const isDuplicate = existingCategories.some(
      cat => cat.label === category.label
    );
    
    if (isDuplicate) {
      throw new Error('이미 존재하는 카테고리입니다.');
    }
    
    // 새 카테고리 추가
    const updatedCategories = [...existingCategories, category];
    await saveUserCategories(category.type, updatedCategories);
  } catch (error) {
    console.error('사용자 카테고리 추가 실패:', error);
    throw error;
  }
}

/**
 * 사용자 카테고리 업데이트하기
 */
export async function updateUserCategory(
  oldCategory: Category,
  newCategory: Category
): Promise<void> {
  try {
    const existingCategories = await loadUserCategories(oldCategory.type);
    
    // 같은 타입인지 확인
    if (oldCategory.type !== newCategory.type) {
      throw new Error('카테고리 타입은 변경할 수 없습니다.');
    }
    
    // 기존 카테고리 찾아서 업데이트
    const updatedCategories = existingCategories.map(cat =>
      cat.label === oldCategory.label ? newCategory : cat
    );
    
    await saveUserCategories(oldCategory.type, updatedCategories);
  } catch (error) {
    console.error('사용자 카테고리 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 사용자 카테고리 삭제하기
 */
export async function deleteUserCategory(category: Category): Promise<void> {
  try {
    const existingCategories = await loadUserCategories(category.type);
    
    // 카테고리 제거
    const updatedCategories = existingCategories.filter(
      cat => cat.label !== category.label
    );
    
    await saveUserCategories(category.type, updatedCategories);
  } catch (error) {
    console.error('사용자 카테고리 삭제 실패:', error);
    throw error;
  }
}
