import type { DatePickerOption } from '@/components/ui/date-picker';

/** 년/월·년도 전용 (일 컬럼 없음). 시스템 DatePicker는 일 컬럼을 숨길 수 없음. */
export function shouldUseAndroidYearMonthSpinner(
  dayOptions: DatePickerOption[] | undefined,
  yearOptions: DatePickerOption[] | undefined,
  monthOptions: DatePickerOption[] | undefined,
  isCustomListOnly: boolean,
): boolean {
  if (isCustomListOnly) {
    return false;
  }
  const hasYearOrMonth = Boolean(yearOptions?.length || monthOptions?.length);
  if (!hasYearOrMonth) {
    return false;
  }
  const isDayOnlyNative =
    Boolean(dayOptions?.length) && !yearOptions?.length && !monthOptions?.length;
  return !isDayOnlyNative;
}

/** Android 일(day) 전용 — 시스템 DatePickerDialog 스피너 */
export function shouldUseAndroidNativeDayPicker(
  dayOptions: DatePickerOption[] | undefined,
  yearOptions: DatePickerOption[] | undefined,
  monthOptions: DatePickerOption[] | undefined,
  isCustomListOnly: boolean,
): boolean {
  if (isCustomListOnly) {
    return false;
  }
  return Boolean(dayOptions?.length) && !yearOptions?.length && !monthOptions?.length;
}

function isYearColumnOptions(options: DatePickerOption[]): boolean {
  if (options.length === 0) {
    return false;
  }
  return options[0].value > 100 || options.some((option) => option.label.includes('년'));
}

/** 옵션 범위 안에서 값 clamp. 없으면 현재 년/월(또는 옵션 중앙) */
export function resolveDefaultPickerValue(options: DatePickerOption[]): number {
  const now = new Date();
  const preferred = isYearColumnOptions(options) ? now.getFullYear() : now.getMonth() + 1;
  const exact = options.find((option) => option.value === preferred);
  if (exact) {
    return exact.value;
  }
  const min = options[0].value;
  const max = options[options.length - 1].value;
  return Math.min(max, Math.max(min, preferred));
}

export function resolvePickerValue(
  selected: number | undefined,
  options?: DatePickerOption[],
): number | undefined {
  if (!options?.length) {
    return undefined;
  }
  if (selected === undefined) {
    return resolveDefaultPickerValue(options);
  }
  const min = options[0].value;
  const max = options[options.length - 1].value;
  return Math.min(max, Math.max(min, selected));
}

export function isCustomListDayPicker(
  dayOptions: DatePickerOption[] | undefined,
  yearOptions: DatePickerOption[] | undefined,
  monthOptions: DatePickerOption[] | undefined,
): boolean {
  const hasYearOrMonth = Boolean(yearOptions?.length || monthOptions?.length);
  if (!dayOptions?.length || hasYearOrMonth) {
    return false;
  }
  return dayOptions.some((option) => option.label.includes('개월'));
}

export function buildNativePickerDate(params: {
  selectedYear?: number;
  selectedMonth?: number;
  selectedDay?: number;
  yearOptions?: DatePickerOption[];
  monthOptions?: DatePickerOption[];
  dayOptions?: DatePickerOption[];
  referenceYear?: number;
  referenceMonth?: number;
}): Date {
  const now = new Date();
  const year = params.yearOptions?.length
    ? resolvePickerValue(params.selectedYear, params.yearOptions)!
    : (params.referenceYear ?? now.getFullYear());
  const month = params.monthOptions?.length
    ? resolvePickerValue(params.selectedMonth, params.monthOptions)!
    : (params.referenceMonth ?? now.getMonth() + 1);
  const day =
    params.selectedDay ?? params.dayOptions?.[0]?.value ?? now.getDate();

  return new Date(year, month - 1, day);
}

export function resolveNativePickerBounds(params: {
  yearOptions?: DatePickerOption[];
  monthOptions?: DatePickerOption[];
  dayOptions?: DatePickerOption[];
  referenceYear?: number;
  referenceMonth?: number;
}): { minimumDate?: Date; maximumDate?: Date } {
  const { yearOptions, dayOptions, referenceYear, referenceMonth } = params;

  if (yearOptions && yearOptions.length > 0) {
    const minYear = yearOptions[0].value;
    const maxYear = yearOptions[yearOptions.length - 1].value;
    return {
      minimumDate: new Date(minYear, 0, 1),
      maximumDate: new Date(maxYear, 11, 31),
    };
  }

  const year = referenceYear ?? new Date().getFullYear();
  const month = referenceMonth ?? new Date().getMonth() + 1;

  if (dayOptions && dayOptions.length > 0) {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      minimumDate: new Date(year, month - 1, 1),
      maximumDate: new Date(year, month - 1, lastDay),
    };
  }

  return {};
}
