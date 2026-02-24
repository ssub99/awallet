/**
 * 간편입력 플레이스홀더 예시 문장
 * - 명사 뒤 조사(을/를, 에, 에서, 이/가)로 자연스러운 구어체
 * - 현재형·과거형만 사용
 */

/** 일반 기록 예시 (일회성 지출) */
export const QUICK_INPUT_PLACEHOLDERS_GENERAL: readonly string[] = [
  '오늘 빵을 2만원어치 사먹었어.',
  '어제 카페에서 5천원 냈어.',
  '오늘 점심에 만오천원 냈어.',
  '저녁에 치킨 먹었는데 2만2천원 썼어.',
  '토요일에 영화본다고 만사천원 썼어.',
  '오늘 주유한다고 6만원 썼어.',
  '어제 마트에서 3만5천원 썼어.',
  '점심에 냉면을 9천원에 먹었어.',
  '오늘 택시 탄다고 만이천원 썼어.',
  '어제 약국에서 2만원 썼어.',
] as const;

/** 정기 기록 예시 (반복 지출) */
export const QUICK_INPUT_PLACEHOLDERS_RECURRING: readonly string[] = [
  '넷플릭스에 매달 9일 만3천원씩 나가.',
  '월세 매달 1일에 80만원씩 나가고 있어.',
  '헬스장 매달 24일에 30만원씩 나가.',
  '통신료 매달 10일 5만원씩 나가.',
  '보험료 매달 19일 15만원씩 나가.',
  '적금 매달 25일 50만원씩 넣고 있어.',
  '학원비 매달 1일에 8만원씩 내고 있어.',
  '관리비 매달 5일에 12만원 냈어.',
  'OTT에 매달 9일 만오천원씩 나가.',
  '월세 매달 1일에 60만원씩 내고 있어.',
] as const;

/** 할부 기록 예시 (분할 결제) */
export const QUICK_INPUT_PLACEHOLDERS_INSTALLMENT: readonly string[] = [
  '아이폰 어제 50만원 12개월 할부로 샀어.',
  '노트북 오늘 120만원 6개월 할부로 샀어.',
  '에어컨 어제 80만원 6개월 할부로 샀어.',
  '갤럭시 오늘 100만원 12개월 할부로 샀어.',
  '냉장고 어제 90만원 12개월 할부로 샀어.',
  'TV를 오늘 70만원 12개월 할부로 샀어.',
  '세탁기 어제 50만원 12개월 할부로 샀어.',
  '침대 오늘 60만원 3개월 할부로 샀어.',
  '전자레인지 30만원 6개월 할부로 샀어.',
  '공기청정기 어제 40만 3개월 할부 샀어.',
] as const;

const ALL_PLACEHOLDERS: readonly string[] = [
  ...QUICK_INPUT_PLACEHOLDERS_GENERAL,
  ...QUICK_INPUT_PLACEHOLDERS_RECURRING,
  ...QUICK_INPUT_PLACEHOLDERS_INSTALLMENT,
];

/**
 * 전체 예시 중 하나를 랜덤으로 반환 (간편입력 플레이스홀더용)
 */
export function getRandomQuickInputPlaceholder(): string {
  const idx = Math.floor(Math.random() * ALL_PLACEHOLDERS.length);
  return ALL_PLACEHOLDERS[idx] ?? QUICK_INPUT_PLACEHOLDERS_GENERAL[0]!;
}
