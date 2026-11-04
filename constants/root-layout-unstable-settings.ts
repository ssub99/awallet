/**
 * Expo Router 진입 앵커.
 * 온보딩이 앱의 첫 화면 — `(tabs)`로 시작한 뒤 replace 하지 않는다.
 * 온보딩 불필요 시 `app/onboarding.tsx`가 /home 으로 넘긴다.
 */
export const rootLayoutUnstableSettings = {
  anchor: 'onboarding',
} as const;
