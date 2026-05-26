import { Platform } from 'react-native';

/** 결제 유형 설정 화면 진입 시 레이아웃·inset 추적 (__DEV__ only) */
export const PAYMENT_TYPE_SETTING_LAYOUT_DEBUG = __DEV__;

const LOG_PREFIX = '[PaymentTypeSetting:Layout]';

export function logPaymentTypeSettingLayout(
  phase: string,
  payload: Record<string, unknown> = {},
): void {
  if (!PAYMENT_TYPE_SETTING_LAYOUT_DEBUG) {
    return;
  }
  console.log(
    LOG_PREFIX,
    phase,
    JSON.stringify({
      platform: Platform.OS,
      ...payload,
    }),
  );
}
