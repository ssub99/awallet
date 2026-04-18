import type { DatePickerOption } from '@/components/ui/date-picker';

/** 챌린지 반복 생성 시 선택 가능한 최소 개월 수 */
export const CHALLENGE_RECURRING_MONTH_MIN = 2;

/** 챌린지 반복 생성 시 선택 가능한 최대 개월 수 */
export const CHALLENGE_RECURRING_MONTH_MAX = 12;

/**
 * 챌린지 생성 화면의 「반복할 개월 수」 휠용 옵션 (MIN~MAX개월).
 */
export function buildChallengeRecurringMonthPickerOptions(): DatePickerOption[] {
  const options: DatePickerOption[] = [];
  for (let n = CHALLENGE_RECURRING_MONTH_MIN; n <= CHALLENGE_RECURRING_MONTH_MAX; n++) {
    options.push({ label: `${n}개월`, value: n });
  }
  return options;
}
