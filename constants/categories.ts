/**
 * Expense Categories Constants
 * 
 * Centralized category definitions for expense tracking.
 * This file provides consistent category data across the application.
 */

export const EXPENSE_CATEGORIES = [
  { emoji: '🍚', label: '식비' },
  { emoji: '🛵', label: '배달음식' },
  { emoji: '☕️', label: '카페/편의점/간식' },
  { emoji: '🚊', label: '교통비' },
  { emoji: '🏠', label: '주거비' },
  { emoji: '📎', label: '공과금' },
  { emoji: '☎️', label: '통신비' },
  { emoji: '🛍️', label: '쇼핑' },
  { emoji: '💇🏻‍♂️', label: '미용' },
  { emoji: '💪', label: '운동/헬스' },
  { emoji: '📌', label: '구독 서비스' },
  { emoji: '🎬', label: '영화' },
  { emoji: '👨🏻‍💻', label: '취미' },
  { emoji: '🧳', label: '여행' },
  { emoji: '🍺', label: '모임/술' },
  { emoji: '🎁', label: '경조사/선물' },
  { emoji: '🚘', label: '차량' },
  { emoji: '🏦', label: '대출/이자' },
  { emoji: '🔖', label: '보험' },
  { emoji: '💵', label: '적금' },
  { emoji: '📈', label: '투자' },
  { emoji: '⚖️', label: '세금' },
  { emoji: '📝', label: '기타' },
] as const;

/**
 * Category type definition
 */
export type ExpenseCategory = {
  emoji: string;
  label: string;
};

/**
 * Get category by label
 */
export function getCategoryByLabel(label: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find(category => category.label === label);
}

/**
 * Get category emoji by label
 */
export function getCategoryEmoji(label: string): string {
  const category = getCategoryByLabel(label);
  return category ? category.emoji : '';
}
