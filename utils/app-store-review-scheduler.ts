/**
 * createExpense / createIncome 과 순환 import를 피하기 위해 동적 import로 지연 로드합니다.
 * 연속 저장 시 microtask 여러 개가 겹치면 in-flight 가드가 뒤쪽 실행을 통째로 삼키는 문제가 있어,
 * setTimeout(0)으로 같은 턴의 스케줄을 한 번으로 합칩니다.
 */
let scheduleHandle: ReturnType<typeof setTimeout> | null = null;

export function scheduleMaybePromptWriteReview(): void {
  if (scheduleHandle !== null) {
    clearTimeout(scheduleHandle);
  }
  scheduleHandle = setTimeout(() => {
    scheduleHandle = null;
    void import('@/utils/app-store-review-prompt').then((m) =>
      m.maybePromptWriteReviewIfEligible(),
    );
  }, 0);
}
