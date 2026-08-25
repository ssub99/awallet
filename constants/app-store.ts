/** App Store Connect 숫자 ID (앱 페이지 / 리뷰 딥링크) */
export const APP_STORE_APP_ID = '6755246069';

/** Play Store 패키지명 (프로덕션) */
export const PLAY_STORE_PACKAGE_NAME = 'com.ssong.awallet';

/** Google Play Store 앱 자체 패키지 (`Intent.setPackage`) */
export const PLAY_STORE_APP_PACKAGE = 'com.android.vending';

/** 인앱 리뷰 1회 시도 여부 (AsyncStorage). reset 시 제거하려면 이 키만 알면 됨 */
export const APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY = 'appStoreWriteReviewPromptShown';

/**
 * 소비·입금 "생성" 누적 (삭제해도 감소 안 함). 배열 길이로 시드하지 않음.
 * 전체 초기화·백업 복원 직후 키 제거 → 0부터 다시 쌓아 복원분은 리뷰 조건에 넣지 않음.
 */
export const APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY = 'appStoreReviewLifetimeRecordCount';

export function getAppStoreWriteReviewUrl(): string {
  // `/app/id…` 는 일부 환경에서 404·빈 페이지. 한국 스토어 정식 경로 사용.
  return `https://apps.apple.com/kr/app/id${APP_STORE_APP_ID}?action=write-review`;
}

/**
 * Play에는 iOS `action=write-review` 동등 딥링크가 없음.
 * `showAllReviews=true`로 리뷰 섹션까지 연다 (Expo StoreReview 권장).
 *
 * `market://`만 쓰면 원스토어·갤럭시 스토어 선택창이 뜸 → Play만 지정한 Intent URI 사용.
 */
export function getPlayStoreWriteReviewIntentUrl(packageName = PLAY_STORE_PACKAGE_NAME): string {
  return `intent://details?id=${packageName}&showAllReviews=true#Intent;scheme=market;package=${PLAY_STORE_APP_PACKAGE};end`;
}

export function getPlayStoreWriteReviewHttpsUrl(packageName = PLAY_STORE_PACKAGE_NAME): string {
  return `https://play.google.com/store/apps/details?id=${packageName}&showAllReviews=true`;
}
