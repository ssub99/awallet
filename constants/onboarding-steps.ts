/**
 * 온보딩 스텝 — Figma `onboarding.default` 단일 패턴.
 * 가변: title / body / 베젤 안 모션. 고정: dots · CTA · chrome.
 *
 * 모션 에셋: assets/onboarding/{quick-input-record,challenge-progress,record-receive-flow}.json
 */

import type { AnimationObject } from 'lottie-react-native';

export type OnboardingMotionSource =
  | { kind: 'lottie'; source: AnimationObject }
  | { kind: 'image'; source: number }
  | { kind: 'none' };

export type OnboardingStep = {
  id: string;
  title: string;
  body: string;
  motion: OnboardingMotionSource;
  /** 마지막 스텝 CTA 라벨 (그 외는 「다음」) */
  ctaLabel?: string;
};

const quickInputLottie =
  require('@/assets/onboarding/quick-input-record.json') as AnimationObject;
const challengeLottie =
  require('@/assets/onboarding/challenge-progress.json') as AnimationObject;
const recordReceiveLottie =
  require('@/assets/onboarding/record-receive-flow.json') as AnimationObject;

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'quickInput',
    title: '한 문장으로 소비 기록 간편생성',
    body: '문장 하나로 번거로운 가계 기록을\n손 쉽게 생성해 보세요.',
    motion: { kind: 'lottie', source: quickInputLottie },
  },
  {
    id: 'challenge',
    title: '챌린지로 소비 습관 만들기',
    body: '목표를 정하고 진행 상황을\n한눈에 확인해 보세요.',
    motion: { kind: 'lottie', source: challengeLottie },
  },
  {
    id: 'recordReceive',
    title: '알림으로 기록 자동 수집',
    body: '카드·문자 알림을 받아\n기록이 자동으로 쌓여요.',
    motion: { kind: 'lottie', source: recordReceiveLottie },
    ctaLabel: '시작하기',
  },
] as const;

export const ONBOARDING_CTA_NEXT = '다음';
