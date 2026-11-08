/**
 * 직전 메인 콘텐츠 탭 (홈 · 챌린지 · 리포트 · 설정).
 */

export type LastMainTabName = 'home' | 'challenge' | 'report' | 'mypage';

let lastMainTab: LastMainTabName = 'home';

export function setLastMainTab(name: LastMainTabName): void {
  lastMainTab = name;
}

export function getLastMainTab(): LastMainTabName {
  return lastMainTab;
}
