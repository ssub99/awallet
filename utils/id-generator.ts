/**
 * ID 생성 유틸리티
 * 
 * 소비, 입금, 챌린지 등 모든 기록의 ID를 통일된 형식으로 생성합니다.
 * UUID v4 형식을 사용하여 예측 불가능하고 충돌 가능성이 극히 낮습니다.
 */

import 'react-native-get-random-values';

/**
 * UUID v4 생성 (RFC4122 표준)
 * 
 * @returns UUID v4 문자열 (예: "550e8400-e29b-41d4-a716-446655440000")
 */
function generateUuidV4(): string {
  // RFC4122 version 4 UUID using crypto.getRandomValues
  // react-native-get-random-values polyfills crypto.getRandomValues
  const bytes = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const b = Array.from(bytes, toHex);
  return `${b[0]}${b[1]}${b[2]}${b[3]}-${b[4]}${b[5]}-${b[6]}${b[7]}-${b[8]}${b[9]}-${b[10]}${b[11]}${b[12]}${b[13]}${b[14]}${b[15]}`;
}

/**
 * 기록 ID 생성 (소비, 입금, 챌린지 등 모든 기록에 사용)
 * 
 * @returns UUID v4 문자열
 * 
 * @example
 * const expenseId = generateRecordId();
 * // "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateRecordId(): string {
  return generateUuidV4();
}

/**
 * 그룹 ID 생성 (정기 기록, 할부 기록, 반복 챌린지 등의 그룹 식별자)
 * 
 * 형식: "recurring_{uuid}" 또는 "installment_{uuid}"
 * 
 * @param type - 그룹 타입 ("recurring" 또는 "installment")
 * @returns 그룹 ID 문자열
 * 
 * @example
 * const groupId = generateGroupId("recurring");
 * // "recurring_550e8400-e29b-41d4-a716-446655440000"
 */
export function generateGroupId(type: 'recurring' | 'installment'): string {
  return `${type}_${generateUuidV4()}`;
}

