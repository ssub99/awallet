/**
 * ID 생성 유틸리티
 * 
 * 소비, 입금, 챌린지 등 모든 기록의 ID를 통일된 형식으로 생성합니다.
 * ULID 형식을 사용하여 시간순 정렬 가능 + 예측 불가능 + 충돌 가능성 극히 낮음
 */

import { ulid, decodeTime } from 'ulid';

/**
 * 기록 ID 생성 (소비, 입금, 챌린지 등 모든 기록에 사용)
 * 
 * ULID 형식: 타임스탬프(10자) + 랜덤(16자) = 총 26자
 * - 시간순 정렬 가능
 * - 예측 불가능
 * - URL-safe
 * 
 * @returns ULID 문자열
 * 
 * @example
 * const expenseId = generateRecordId();
 * // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 */
export function generateRecordId(): string {
  return ulid();
}

/**
 * 그룹 ID 생성 (정기 기록, 할부 기록, 반복 챌린지 등의 그룹 식별자)
 * 
 * ULID 형식 사용 (개별 ID와 동일)
 * 
 * @param type - 그룹 타입 (하위 호환성 유지를 위한 매개변수, 실제로는 사용하지 않음)
 * @returns 그룹 ID 문자열 (ULID)
 * 
 * @example
 * const groupId = generateGroupId("recurring");
 * // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 */
export function generateGroupId(type: 'recurring' | 'installment'): string {
  return ulid();
}

/**
 * ID(ULID 또는 legacy timestamp string)에서 생성 시각(밀리초)을 추출
 *
 * - 새 ULID → decodeTime 사용
 * - 기존 timestamp string → Number 변환
 *
 * @param id - ULID 또는 timestamp string
 * @returns 밀리초 타임스탬프, 추출 실패 시 null
 */
export function extractTimestampFromId(id?: string | null): number | null {
  if (!id) {
    return null;
  }

  const numeric = Number(id);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  try {
    return decodeTime(id);
  } catch {
    return null;
  }
}


