/**
 * 온보딩 모션 타이밍 — 게이트·스크린이 공유.
 * 컨텐츠 페이드가 끝난 뒤에만 홈 Stack 프리워밍을 시작해
 * 첫 페인트/Lottie와 경쟁하지 않게 한다.
 */
export const ONBOARDING_CONTENT_FADE_MS = 280;
export const ONBOARDING_TO_HOME_FADE_MS = 320;
/** 컨텐츠 페이드 종료 후 → Stack 프리마운트까지 여유 (첫 Lottie 안정화) */
export const ONBOARDING_STACK_PREWARM_DELAY_MS = 120;
