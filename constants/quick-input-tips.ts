/**
 * 간편입력 롱버전 팁 박스 문구
 * (Notion: 간편 입력 작성 TIP UI 추가)
 */
export const QUICK_INPUT_TIPS = [
  '원하는대로 생성되지 않으신가요? 카테고리를 먼저 설정해 주세요.',
  '소비 카테고리, 날짜, 금액을 기입해야 정상적으로 생성됩니다.',
  '수입/소비 기록 모두 기입하여 간편 생성하실 수 있어요.',
  '기록 생성 시 단일/반복 기록 생성 모두 가능해요.',
] as const;

/** 직전에 보여 준 팁 인덱스 (간편입력 닫힌 뒤 다음 열 때 중복 방지) */
let lastShownQuickInputTipIndex: number | null = null;

export function rememberQuickInputTipIndex(index: number): void {
  if (index >= 0 && index < QUICK_INPUT_TIPS.length) {
    lastShownQuickInputTipIndex = index;
  }
}

function normalizeTipIndex(index: number): number {
  const n = QUICK_INPUT_TIPS.length;
  return ((index % n) + n) % n;
}

/** excludeIndex를 제외한 인덱스 중 균등 랜덤 */
export function pickRandomQuickInputTipIndexExcluding(
  excludeIndex: number | null = lastShownQuickInputTipIndex
): number {
  const n = QUICK_INPUT_TIPS.length;
  if (n <= 1) return 0;
  if (excludeIndex == null || excludeIndex < 0 || excludeIndex >= n) {
    return Math.floor(Math.random() * n);
  }
  const r = Math.floor(Math.random() * (n - 1));
  return r >= excludeIndex ? r + 1 : r;
}

/** 간편입력 열 때 첫 문장 — 직전에 본 문장과는 다르게 선택 */
export function pickInitialQuickInputTipIndex(): number {
  return pickRandomQuickInputTipIndexExcluding(lastShownQuickInputTipIndex);
}

/** 순차 전환 시 현재와 다른 인덱스로 보정 */
export function resolveSequentialTipIndex(
  currentIndex: number,
  rawNextIndex: number,
  direction: 'next' | 'prev'
): number {
  const n = QUICK_INPUT_TIPS.length;
  if (n <= 1) return 0;

  let next = normalizeTipIndex(rawNextIndex);
  if (next !== currentIndex) {
    return next;
  }

  return direction === 'next'
    ? normalizeTipIndex(currentIndex + 1)
    : normalizeTipIndex(currentIndex - 1);
}
