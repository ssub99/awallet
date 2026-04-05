/**
 * Custom Month Utility
 * 
 * Handles month calculations based on custom month start day.
 * 
 * Examples:
 * - Month starts on 1st (default): Jan 1 ~ Jan 31
 * - Month starts on 15th: Jan 15 ~ Feb 14
 * - Month starts on 25th: Jan 25 ~ Feb 24
 */

export interface CustomMonthInfo {
  year: number;
  month: number; // 1-12
  startDate: Date;
  endDate: Date;
}

/**
 * calendarData 날짜 키(YYYY-MM-DD)를 디바이스 로컬 자정 Date로 변환합니다.
 * `new Date('YYYY-MM-DD')`는 UTC 자정으로 해석되어, 홈 캘린더(로컬 요일)·월 합계와
 * 소비 지수 집계가 월 말일 등에서 어긋날 수 있습니다.
 */
export function parseCalendarDateKeyLocal(dateKey: string): Date | null {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Get custom month info for a specific date
 * 
 * @param date - The date to check
 * @param monthStartDay - Day of month that starts the custom month (1-31)
 * @returns Custom month information
 * 
 * @example
 * // Month starts on 15th
 * getCustomMonthInfo(new Date('2025-01-20'), 15)
 * // Returns: { year: 2025, month: 1, startDate: Jan 15, endDate: Feb 14 }
 * 
 * getCustomMonthInfo(new Date('2025-02-10'), 15)
 * // Returns: { year: 2025, month: 1, startDate: Jan 15, endDate: Feb 14 }
 * 
 * getCustomMonthInfo(new Date('2025-02-15'), 15)
 * // Returns: { year: 2025, month: 2, startDate: Feb 15, endDate: Mar 14 }
 */
export function getCustomMonthInfo(date: Date, monthStartDay: number = 1): CustomMonthInfo {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 0-11 → 1-12
  const day = date.getDate();
  
  // If month starts on 1st (default), use standard month
  if (monthStartDay === 1) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month
    
    return {
      year,
      month,
      startDate,
      endDate,
    };
  }
  
  // For custom month start day
  let customYear = year;
  let customMonth = month;
  
  // If current day is before month start day, this date belongs to previous custom month
  if (day < monthStartDay) {
    customMonth -= 1;
    if (customMonth < 1) {
      customMonth = 12;
      customYear -= 1;
    }
  }
  
  // Calculate start date of custom month
  const startDate = new Date(customYear, customMonth - 1, monthStartDay);
  
  // Calculate end date (day before next month start)
  let endYear = customYear;
  let endMonth = customMonth + 1;
  if (endMonth > 12) {
    endMonth = 1;
    endYear += 1;
  }
  
  const endDate = new Date(endYear, endMonth - 1, monthStartDay - 1);
  
  return {
    year: customYear,
    month: customMonth,
    startDate,
    endDate,
  };
}

/**
 * Get custom month range for a specific year and month
 * 
 * @param year - Year
 * @param month - Month (1-12)
 * @param monthStartDay - Day of month that starts the custom month (1-31)
 * @returns Start and end dates of the custom month
 * 
 * @example
 * // Get January 2025 range with month starting on 15th
 * getCustomMonthRange(2025, 1, 15)
 * // Returns: { startDate: Jan 15 2025, endDate: Feb 14 2025 }
 */
export function getCustomMonthRange(
  year: number,
  month: number,
  monthStartDay: number = 1
): { startDate: Date; endDate: Date } {
  // If month starts on 1st (default), use standard month
  if (monthStartDay === 1) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month
    
    return { startDate, endDate };
  }
  
  // For custom month start day
  const startDate = new Date(year, month - 1, monthStartDay);
  
  // Calculate end date (day before next month start)
  let endYear = year;
  let endMonth = month + 1;
  if (endMonth > 12) {
    endMonth = 1;
    endYear += 1;
  }
  
  const endDate = new Date(endYear, endMonth - 1, monthStartDay - 1);
  
  return { startDate, endDate };
}

/**
 * Check if a date is within a custom month
 * 
 * @param date - Date to check
 * @param year - Custom month year
 * @param month - Custom month (1-12)
 * @param monthStartDay - Day of month that starts the custom month (1-31)
 * @returns True if date is within the custom month
 */
export function isDateInCustomMonth(
  date: Date,
  year: number,
  month: number,
  monthStartDay: number = 1
): boolean {
  const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);
  
  const dateTime = date.getTime();
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  
  const result = dateTime >= startTime && dateTime <= endTime;
  
  // 디버깅 로그 (5% 확률로)
  if (Math.random() < 0.05) {
    // 로컬 시간 기준으로 날짜 문자열 생성
    const formatLocalDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    
    const dateStr = formatLocalDate(date);
    const startStr = formatLocalDate(startDate);
    const endStr = formatLocalDate(endDate);
  }
  
  return result;
}

/**
 * Format custom month for display
 * 
 * @param year - Year
 * @param month - Month (1-12)
 * @param monthStartDay - Day of month that starts the custom month (1-31)
 * @returns Formatted string
 * 
 * @example
 * formatCustomMonth(2025, 1, 1)  // "2025년 1월"
 * formatCustomMonth(2025, 1, 15) // "2025년 1월 (15일~)"
 */
export function formatCustomMonth(
  year: number,
  month: number,
  monthStartDay: number = 1
): string {
  if (monthStartDay === 1) {
    return `${year}년 ${month}월`;
  }
  
  return `${year}년 ${month}월 (${monthStartDay}일~)`;
}

/**
 * Get the previous custom month
 * 
 * @param year - Current year
 * @param month - Current month (1-12)
 * @returns Previous custom month year and month
 */
export function getPreviousCustomMonth(
  year: number,
  month: number
): { year: number; month: number } {
  let prevMonth = month - 1;
  let prevYear = year;
  
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  
  return { year: prevYear, month: prevMonth };
}

/**
 * Get the next custom month
 * 
 * @param year - Current year
 * @param month - Current month (1-12)
 * @returns Next custom month year and month
 */
export function getNextCustomMonth(
  year: number,
  month: number
): { year: number; month: number } {
  let nextMonth = month + 1;
  let nextYear = year;
  
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  
  return { year: nextYear, month: nextMonth };
}

/**
 * Get current custom month based on today's date
 * 
 * @param monthStartDay - Day of month that starts the custom month (1-31)
 * @returns Current custom month info
 */
export function getCurrentCustomMonth(monthStartDay: number = 1): CustomMonthInfo {
  const today = new Date();
  return getCustomMonthInfo(today, monthStartDay);
}


