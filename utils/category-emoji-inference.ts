/**
 * 엑셀 복원 시 카테고리 이름만 있는 경우 이모지를 보완합니다.
 * - 기본(내장) 카테고리: constants 정의 이모지 사용
 * - 사용자 생성 카테고리: ✅ 고정
 */

import {
  type Category,
  type CategoryType,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoriesByType,
} from '@/constants/categories';

const USER_CREATED_CATEGORY_EMOJI = '✅';

const BUILT_IN_EXPENSE_LABELS = new Set(EXPENSE_CATEGORIES.map((c) => c.label));
const BUILT_IN_INCOME_LABELS = new Set(INCOME_CATEGORIES.map((c) => c.label));

/** 구버전 엑셀 "이모지 이름" 형식에서 이름만 추출 */
export function normalizeExcelCategoryLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const builtInMatch = [...BUILT_IN_EXPENSE_LABELS, ...BUILT_IN_INCOME_LABELS].find(
    (label) => trimmed === label || trimmed.endsWith(` ${label}`) || trimmed.endsWith(label),
  );
  if (builtInMatch && (trimmed === builtInMatch || trimmed.endsWith(builtInMatch))) {
    return builtInMatch;
  }

  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx > 0) {
    const maybeLabel = trimmed.slice(spaceIdx + 1).trim();
    if (maybeLabel) return maybeLabel;
  }
  return trimmed;
}

export function isBuiltInCategoryLabel(label: string, type: CategoryType): boolean {
  const set = type === 'expense' ? BUILT_IN_EXPENSE_LABELS : BUILT_IN_INCOME_LABELS;
  return set.has(label);
}

function getBuiltInCategoryEmoji(label: string, type: CategoryType): string | undefined {
  return getCategoriesByType(type).find((c) => c.label === label)?.emoji;
}

/**
 * 엑셀에서 읽은 카테고리 이름 목록을 앱 Category[]로 변환합니다.
 */
export function resolveCategoryLabelsForExcelRestore(
  labels: string[],
  type: CategoryType,
): Category[] {
  const seen = new Set<string>();
  const result: Category[] = [];

  for (const raw of labels) {
    const label = normalizeExcelCategoryLabel(raw);
    if (!label || seen.has(label)) continue;
    seen.add(label);

    const emoji = isBuiltInCategoryLabel(label, type)
      ? (getBuiltInCategoryEmoji(label, type) ?? USER_CREATED_CATEGORY_EMOJI)
      : USER_CREATED_CATEGORY_EMOJI;

    result.push({ emoji, label, type });
  }

  return result;
}
