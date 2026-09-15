/**
 * 문자 수신함 설정 가이드 (iOS 단축어 자동화)
 * Fluid: settings.smsReceive.setupGuide
 * Figma: 2304:23047(01) · 2304:23320(02) · 2304:23488(03) · 2304:23650(04) · 2304:23959(05) · 2304:24278(06)
 */

import type { ImageSource } from 'expo-image';

export type SmsInboxSetupGuideStep = {
  id: string;
  /** 예: Step 01. 단축어 추가 */
  title: string;
  description: string;
  image: ImageSource;
};

/** 에셋·Figma Frame 309 = 299×436 */
export const SMS_INBOX_SETUP_GUIDE_IMAGE_ASPECT = 299 / 436;

/** Figma Frame 309 / guideImageBody cornerRadius */
export const SMS_INBOX_SETUP_GUIDE_IMAGE_RADIUS = 16;

/**
 * Step 카피 = Figma 원본 (타이틀 · 본문).
 * 줄바꿈은 Figma `\u2028` → `\n`.
 */
/** release 번들 안정성: PNG는 `@/` alias 대신 relative require */
export const SMS_INBOX_SETUP_GUIDE_STEPS: readonly SmsInboxSetupGuideStep[] = [
  {
    id: '01',
    title: 'Step 01. 단축어 추가',
    description: 'OS에서 제공하는 단축어에\n에이월렛의 문자 수신함 기능을 추가합니다.',
    image: require('../assets/images/sms_receive-setting-guide01.png'),
  },
  {
    id: '02',
    title: 'Step 02. 자동화 추가',
    description: '단축어 앱에서 제공하는\n자동화 기능을 추가합니다.',
    image: require('../assets/images/sms_receive-setting-guide02.png'),
  },
  {
    id: '03',
    title: 'Step 03. 자동화 기능 선택',
    description: '자동화 기능 중 문자 수신 시\n작동하는 기능을 선택합니다.',
    image: require('../assets/images/sms_receive-setting-guide03.png'),
  },
  {
    id: '04',
    title: 'Step 04. 수신번호 지정',
    description: '수신할 번호를 지정(국가 번호 포함)하고\n문자 수신 즉시 자동 실행하도록 설정합니다.',
    image: require('../assets/images/sms_receive-setting-guide04.png'),
  },
  {
    id: '05',
    title: 'Step 05. 실행할 단축어 선택',
    description: '지정한 번호의 문자 수신 시\n설정해둔 단축어가 자동 실행되도록 선택합니다.',
    image: require('../assets/images/sms_receive-setting-guide05.png'),
  },
  {
    id: '06',
    title: 'Step 06. 수신번호 설정',
    description: '자동화에서 추가한 번호와\n동일한 번호를 추가하여 문자 수신을 시작합니다.',
    image: require('../assets/images/sms_receive-setting-guide06.png'),
  },
] as const;
