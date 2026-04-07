/** App Store Connect 숫자 ID (앱 페이지 / 리뷰 딥링크) */
export const APP_STORE_APP_ID = '6755246069';

export function getAppStoreWriteReviewUrl(): string {
  return `https://apps.apple.com/app/id${APP_STORE_APP_ID}?action=write-review`;
}
