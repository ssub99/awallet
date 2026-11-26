/**
 * 결제 유형 필터 선택값 — 해제한 항목을 기억하면서, 새로 추가된 항목만 자동 선택한다.
 *
 * 선택한 항목만 저장하면 「해제한 것」과 「새로 생긴 것」을 구분할 수 없어,
 * 선택 당시에 있던 항목 목록(`known`)을 함께 저장한다.
 */

export const REPORT_PAYMENT_FILTER_STORAGE_KEY = 'challengeTrendPaymentFilter_v1';
export const TIMELINE_PAYMENT_FILTER_STORAGE_KEY = 'monthlyTimelinePaymentFilter';

export function getKnownOptionsStorageKey(storageKey: string): string {
  return `${storageKey}_knownOptions`;
}

/** 전체 초기화 때 지울 키 */
export const PAYMENT_FILTER_STORAGE_KEYS = [
  REPORT_PAYMENT_FILTER_STORAGE_KEY,
  TIMELINE_PAYMENT_FILTER_STORAGE_KEY,
].flatMap((key) => [key, getKnownOptionsStorageKey(key)]);

export interface PaymentFilterSelection {
  /** null: 저장된 선택값이 없음 → 전체 선택 */
  selected: string[] | null;
  /** null: 항목 목록을 저장하기 전 버전의 데이터 */
  known: string[] | null;
}

export function parseStoredKeys(stored: string | null): string[] | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) && parsed.every((key) => typeof key === 'string')
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

const isSameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * 저장값을 현재 항목 목록에 맞춘다. 바뀔 것이 없으면 받은 객체를 그대로 돌려준다.
 * - 저장값 없음: 전체 선택
 * - 새로 생긴 항목: 선택에 추가
 * - 삭제된 항목: 선택에서 제거
 * - 그 외 해제한 항목: 해제 유지
 */
export function reconcilePaymentFilter(
  selection: PaymentFilterSelection,
  optionIds: string[],
): PaymentFilterSelection {
  const { selected, known } = selection;
  let nextSelected = optionIds;
  if (selected !== null) {
    // 항목 목록이 없던 이전 데이터는 저장된 선택을 그대로 믿는다
    const added = known === null ? [] : optionIds.filter((id) => !known.includes(id));
    nextSelected = [
      ...selected.filter((id) => optionIds.includes(id)),
      ...added.filter((id) => !selected.includes(id)),
    ];
  }
  if (
    selected !== null &&
    known !== null &&
    isSameList(selected, nextSelected) &&
    isSameList(known, optionIds)
  ) {
    return selection;
  }
  return { selected: nextSelected, known: optionIds };
}
