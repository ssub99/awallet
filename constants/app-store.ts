/** App Store Connect 숫자 ID (앱 페이지 / 리뷰 딥링크) */
export const APP_STORE_APP_ID = '6755246069';

/** 인앱 리뷰 1회 시도 여부 (AsyncStorage). reset 시 제거하려면 이 키만 알면 됨 */
export const APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY = 'appStoreWriteReviewPromptShown';

/**
 * 소비·입금 "생성" 누적 (삭제해도 감소 안 함). 배열 길이로 시드하지 않음.
 * 전체 초기화·백업 복원 직후 키 제거 → 0부터 다시 쌓아 복원분은 리뷰 조건에 넣지 않음.
 */
export const APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY = 'appStoreReviewLifetimeRecordCount';

export function getAppStoreWriteReviewUrl(): string {
  return `https://apps.apple.com/app/id${APP_STORE_APP_ID}?action=write-review`;
}
