/**
 * 온보딩 스텝 — Figma `onboarding.default` 단일 패턴.
 * 가변: title / body / 베젤 안 모션. 고정: dots · CTA · chrome.
 *
 * Lottie JSON(~1.4MB 합)은 스텝 활성화 시에만 require — 모듈 로드 시 3개 한꺼번에 파싱하지 않음.
 */

import type { AnimationObject } from 'lottie-react-native';

export type OnboardingMotionSource =
  | { kind: 'lottie'; source: AnimationObject }
  | { kind: 'image'; source: number }
  | { kind: 'none' };

export type OnboardingMotionId = 'quickInput' | 'challenge' | 'recordReceive';

export type OnboardingStep = {
  id: OnboardingMotionId;
  title: string;
  body: string;
  /** 마지막 스텝 CTA 라벨 (그 외는 「다음」) */
  ctaLabel?: string;
};

const lottieCache = new Map<OnboardingMotionId, AnimationObject>();

function loadLottie(id: OnboardingMotionId): AnimationObject {
  const cached = lottieCache.get(id);
  if (cached) return cached;
  let source: AnimationObject;
  switch (id) {
    case 'quickInput':
      source = require('@/assets/onboarding/quick-input-record.json') as AnimationObject;
      break;
    case 'challenge':
      source = require('@/assets/onboarding/challenge-progress.json') as AnimationObject;
      break;
    case 'recordReceive':
      source = require('@/assets/onboarding/record-receive-flow.json') as AnimationObject;
      break;
  }
  lottieCache.set(id, source);
  return source;
}

/** 활성 스텝에서만 호출 — 비활성 페이지는 플레이스홀더만 둔다 */
export function getOnboardingMotion(id: OnboardingMotionId): OnboardingMotionSource {
  return { kind: 'lottie', source: loadLottie(id) };
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'quickInput',
    title: '한 문장으로 소비 기록 간편생성',
    body: '문장 하나로 번거로운 소비 기록을\n손쉽게 생성해 보세요.',
  },
  {
    id: 'challenge',
    title: '챌린지로 소비 습관 만들기',
    body: '목표를 정하고 진행 상황을\n한눈에 확인해 보세요.',
  },
  {
    id: 'recordReceive',
    title: '알림으로 기록 자동 수집',
    body: '카드·문자 알림을 받아\n기록이 자동으로 쌓여요.',
    ctaLabel: '시작하기',
  },
] as const;

export const ONBOARDING_CTA_NEXT = '다음';
