import type { Href } from 'expo-router';

let pendingHref: Href | null = null;

/** 설정 탭 콘텐츠가 준비된 뒤 그 위로 push할 화면을 예약한다. 예약 후 `router.navigate('/mypage')` */
export function setSettingsTabPendingPush(href: Href): void {
  pendingHref = href;
}

/** 설정 탭이 콘텐츠 준비 직후 호출. 예약된 화면을 꺼내고 비운다 */
export function consumeSettingsTabPendingPush(): Href | null {
  const href = pendingHref;
  pendingHref = null;
  return href;
}
