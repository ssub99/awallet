/**
 * 화면 소유 탭 SSOT (네비 구조 이전용).
 * analytics `screen_name`은 논리 경로를 유지하고, router pathname만 소유 경로를 쓴다.
 *
 * 타임라인: NativeTabs `hidden`은 하단 inset이 줄어 보이므로 루트 Stack 유지
 * (탭바를 덮는 UX). hidesBottomBarWhenPushed 수준 API가 오면 홈 스택으로 이전.
 */

export type MainTabOwner = 'home' | 'challenge' | 'mypage';

export const HOME_STACK_PATHS = {
  index: '/home',
} as const;

/** 논리 화면 이름 → 소유 (타임라인은 홈 소유의 루트 화면) */
export const SCREEN_OWNER: Record<string, MainTabOwner> = {
  '/home': 'home',
  '/monthly-expense-timeline': 'home',
};
