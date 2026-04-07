/**
 * createExpense / createIncome 등 저장 유틸과의 순환 import를 피하기 위해
 * 리뷰 프롬프트 검사는 동적 import로 지연 로드합니다.
 */
export function scheduleMaybePromptWriteReview(): void {
  queueMicrotask(() => {
    void import('@/utils/app-store-review-prompt').then((m) =>
      m.maybePromptWriteReviewIfEligible(),
    );
  });
}
