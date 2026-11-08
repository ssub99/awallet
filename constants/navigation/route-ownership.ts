/**
 * 화면 소유 탭 SSOT (네비 구조 이전용).
 * analytics `screen_name`은 논리 경로를 유지하고, router pathname만 소유 경로를 쓴다.
 *
 * 탭 루트: home / challenge / report / mypage 각각 Stack 골격.
 * 탭바를 가려야 하는 상세(타임라인·챌린지 상세·설정 하위 등)는 루트 Stack 유지.
 * hidesBottomBarWhenPushed 수준 API가 오면 탭 스택 이전을 재검토.
 */

export type MainTabOwner = 'home' | 'challenge' | 'report' | 'mypage';

export const HOME_STACK_PATHS = {
  index: '/home',
} as const;

export const CHALLENGE_STACK_PATHS = {
  index: '/challenge',
} as const;

export const REPORT_STACK_PATHS = {
  index: '/report',
} as const;

export const MYPAGE_STACK_PATHS = {
  index: '/mypage',
} as const;

/** 논리 화면 이름 → 소유 (상세는 루트에 있어도 소유 탭 표기) */
export const SCREEN_OWNER: Record<string, MainTabOwner> = {
  '/home': 'home',
  '/monthly-expense-timeline': 'home',
  '/challenge': 'challenge',
  '/challenge-detail': 'challenge',
  '/challenge-create': 'challenge',
  '/challenge-edit': 'challenge',
  '/report': 'report',
  '/mypage': 'mypage',
};
