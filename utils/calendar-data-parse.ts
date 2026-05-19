/**
 * AsyncStorage calendarData JSON 파싱 (타입 경계만 담당, 구조 검증/변환 없음)
 */

import type { CalendarData } from '@/utils/consumption-index';

/** JSON 문자열을 CalendarData로 파싱합니다. null/빈 값은 {}. */
export function parseCalendarDataFromJson(raw: string | null | undefined): CalendarData {
  if (!raw) return {};
  return JSON.parse(raw) as CalendarData;
}
