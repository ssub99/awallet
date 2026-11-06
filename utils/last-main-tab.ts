/**
 * 기록하기(action) 탭이 잠깐 포커스됐을 때 복귀할 직전 메인 탭.
 */

export type LastMainTabName = 'home' | 'challenge' | 'mypage';

let lastMainTab: LastMainTabName = 'home';

export function setLastMainTab(name: LastMainTabName): void {
  lastMainTab = name;
}

export function getLastMainTab(): LastMainTabName {
  return lastMainTab;
}
