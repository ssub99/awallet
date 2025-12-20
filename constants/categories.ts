/**
 * Categories Constants
 * 
 * Centralized category definitions for expense and income tracking.
 * This file provides consistent category data across the application.
 */

export type CategoryType = 'expense' | 'income';

/**
 * Category type definition
 */
export type Category = {
  emoji: string;
  label: string;
  type: CategoryType;
};

/**
 * Legacy type for backward compatibility
 */
export type ExpenseCategory = {
  emoji: string;
  label: string;
};

/**
 * Expense Categories (기존 카테고리는 모두 지출로 정의)
 */
export const EXPENSE_CATEGORIES: Category[] = [
  { emoji: '🍚', label: '식비', type: 'expense' },
  { emoji: '🛵', label: '배달음식', type: 'expense' },
  { emoji: '☕️', label: '카페/편의점/간식', type: 'expense' },
  { emoji: '🚊', label: '교통비', type: 'expense' },
  { emoji: '🏠', label: '주거비', type: 'expense' },
  { emoji: '📎', label: '공과금', type: 'expense' },
  { emoji: '☎️', label: '통신비', type: 'expense' },
  { emoji: '🛍️', label: '쇼핑', type: 'expense' },
  { emoji: '💇🏻‍♂️', label: '미용', type: 'expense' },
  { emoji: '💪', label: '운동/헬스', type: 'expense' },
  { emoji: '📌', label: '구독 서비스', type: 'expense' },
  { emoji: '🎬', label: '영화', type: 'expense' },
  { emoji: '👨🏻‍💻', label: '취미', type: 'expense' },
  { emoji: '🧳', label: '여행', type: 'expense' },
  { emoji: '🍺', label: '모임/술', type: 'expense' },
  { emoji: '🎁', label: '경조사/선물', type: 'expense' },
  { emoji: '🚘', label: '차량', type: 'expense' },
  { emoji: '🏦', label: '대출/이자', type: 'expense' },
  { emoji: '🔖', label: '보험', type: 'expense' },
  { emoji: '💵', label: '적금', type: 'expense' },
  { emoji: '📈', label: '투자', type: 'expense' },
  { emoji: '⚖️', label: '세금', type: 'expense' },
  { emoji: '📝', label: '기타', type: 'expense' },
];

/**
 * Income Categories (새로 추가되는 카테고리는 수입으로 정의)
 */
export const INCOME_CATEGORIES: Category[] = [
  // 수입 카테고리는 사용자가 생성/편집할 수 있도록 빈 배열로 시작
  // 추후 사용자가 추가한 카테고리들이 여기에 저장됨
];

/**
 * Get all categories (expense + income)
 */
export function getAllCategories(): Category[] {
  return [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
}

/**
 * Get categories by type (including user-created categories)
 * Note: This function returns only built-in categories.
 * Use getCategoriesByTypeAsync for categories including user-created ones.
 */
export function getCategoriesByType(type: CategoryType): Category[] {
  if (type === 'expense') {
    return EXPENSE_CATEGORIES;
  }
  return INCOME_CATEGORIES;
}

/**
 * Get expense categories only (for backward compatibility and challenge filtering)
 */
export function getExpenseCategories(): Category[] {
  return EXPENSE_CATEGORIES;
}

/**
 * Get category by label (searches both expense and income categories)
 */
export function getCategoryByLabel(label: string): Category | undefined {
  return getAllCategories().find(category => category.label === label);
}

/**
 * Get category emoji by label
 */
export function getCategoryEmoji(label: string): string {
  const category = getCategoryByLabel(label);
  return category ? category.emoji : '';
}

/**
 * Get category type by label
 */
export function getCategoryType(label: string): CategoryType | undefined {
  const category = getCategoryByLabel(label);
  return category ? category.type : undefined;
}
