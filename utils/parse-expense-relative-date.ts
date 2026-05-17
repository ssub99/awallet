/**
 * 간편입력(parse-expense)용: 메시지의 (저번주|이번주|다음주)+(요일)을
 * 기준일(today YYYY.MM.DD)과 **월요일 시작 주**로만 계산해 절대일로 바꿉니다.
 * LLM 산술 오류 방지를 위해 API에서 records[].date 덮어쓰기에 사용합니다.
 */

const KOREAN_WEEKDAY_FROM_MONDAY: Record<string, number> = {
  월요일: 0,
  월욜: 0,
  화요일: 1,
  화욜: 1,
  수요일: 2,
  수욜: 2,
  목요일: 3,
  목욜: 3,
  금요일: 4,
  금욜: 4,
  토요일: 5,
  토욜: 5,
  일요일: 6,
  일욜: 6,
};

/** 주 접두 + 요일(전체 이름). 공백은 \s* 로 허용 */
const RELATIVE_WEEKDAY_RE =
  /(저번주|지난주|전주|이번주|금주|이번\s*주|다음주|차주|다음\s*주)\s*(월요일|월욜|화요일|화욜|수요일|수욜|목요일|목욜|금요일|금욜|토요일|토욜|일요일|일욜)/;

/** 월 접두 + N번째 주 + 요일. 예: 저번달 첫째 주 월요일 */
const RELATIVE_MONTH_ORDINAL_WEEKDAY_RE =
  /((?:\d{4}년)?\d{1,2}월|저번달|지난달|전월|이번달|금월|다음달|내달|(?:올해|금년|작년|지난해|내년|다음해)\d{1,2}월)(첫째|첫번째|첫|둘째|두번째|둘|셋째|세번째|셋|넷째|네번째|넷|다섯째|다섯번째|다섯|1째|1번째|1|2째|2번째|2|3째|3번째|3|4째|4번째|4|5째|5번째|5)(?:주차|주)(월요일|월욜|화요일|화욜|수요일|수욜|목요일|목욜|금요일|금욜|토요일|토욜|일요일|일욜)?/;

/** 월 접두 + 요일. 예: 저번달 목요일 */
const RELATIVE_MONTH_WEEKDAY_RE =
  /((?:\d{4}년)?\d{1,2}월|저번달|지난달|전월|이번달|금월|다음달|내달|(?:올해|금년|작년|지난해|내년|다음해)\d{1,2}월)(월요일|월욜|화요일|화욜|수요일|수욜|목요일|목욜|금요일|금욜|토요일|토욜|일요일|일욜)/;

/** 월 접두 + 일자. 예: 저번달 16일 */
const RELATIVE_MONTH_DAY_RE =
  /((?:\d{4}년)?\d{1,2}월|저번달|지난달|전월|이번달|금월|다음달|내달|(?:올해|금년|작년|지난해|내년|다음해)\d{1,2}월)(\d{1,2})일/;

/** 월 접두 + 초/중순/말. 예: 지난달 말 */
const RELATIVE_MONTH_PHASE_RE =
  /((?:\d{4}년)?\d{1,2}월|저번달|지난달|전월|이번달|금월|다음달|내달|(?:올해|금년|작년|지난해|내년|다음해)\d{1,2}월)(초반|초순|초|중순|중반|말일|월말|말쯤|말경|말)/;

/** N일/주/개월 전. 예: 10일 전에, 2주전부터 */
const RELATIVE_AGO_RE = /(\d{1,2})(일|주|개월|달)전(?:에|부터|쯤|경)?/;

/** 작년/올해/내년 + 초/중순/말. 예: 작년 말 */
const RELATIVE_YEAR_PHASE_RE =
  /(작년|지난해|올해|금년|내년|다음해)(초반|초순|초|중순|중반|말일|연말|말쯤|말경|말)/;

const KOREAN_WEEKDAY_FROM_JS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const;

function parseTodayDot(todayDot: string): { year: number; month: number; day: number } | null {
  const m = todayDot.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return { year, month, day };
}

function formatDotDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${mo}.${day}`;
}

/** 기준일이 속한 주의 월요일 12:00 (로컬 달력, JS getDay: 일=0) */
function startOfMondayWeek(anchor: Date): Date {
  const c = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12, 0, 0, 0);
  const dow = c.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  c.setDate(c.getDate() - daysFromMonday);
  return c;
}

function weekOffsetFromToken(weekNormalized: string): number | undefined {
  if (weekNormalized === '저번주' || weekNormalized === '지난주' || weekNormalized === '전주') {
    return -1;
  }
  if (weekNormalized === '이번주' || weekNormalized === '금주') {
    return 0;
  }
  if (weekNormalized === '다음주' || weekNormalized === '차주') {
    return 1;
  }
  return undefined;
}

function ordinalWeekFromToken(token: string): number | undefined {
  if (token === '첫째' || token === '첫번째' || token === '첫' || token === '1째' || token === '1번째' || token === '1') {
    return 1;
  }
  if (token === '둘째' || token === '두번째' || token === '둘' || token === '2째' || token === '2번째' || token === '2') {
    return 2;
  }
  if (token === '셋째' || token === '세번째' || token === '셋' || token === '3째' || token === '3번째' || token === '3') {
    return 3;
  }
  if (token === '넷째' || token === '네번째' || token === '넷' || token === '4째' || token === '4번째' || token === '4') {
    return 4;
  }
  if (token === '다섯째' || token === '다섯번째' || token === '다섯' || token === '5째' || token === '5번째' || token === '5') {
    return 5;
  }
  return undefined;
}

function resolveMonthToken(
  monthToken: string,
  today: { year: number; month: number; day: number },
): { year: number; month: number } | null {
  if (monthToken === '저번달' || monthToken === '지난달' || monthToken === '전월') {
    return addMonths(today.year, today.month, -1);
  }
  if (monthToken === '이번달' || monthToken === '금월') {
    return { year: today.year, month: today.month };
  }
  if (monthToken === '다음달' || monthToken === '내달') {
    return addMonths(today.year, today.month, 1);
  }

  const yearMonth = monthToken.match(/^(\d{4})년(\d{1,2})월$/);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    if (Number.isFinite(year) && month >= 1 && month <= 12) return { year, month };
    return null;
  }

  const currentYearMonth = monthToken.match(/^(?:올해|금년)(\d{1,2})월$/);
  if (currentYearMonth) {
    const month = Number(currentYearMonth[1]);
    if (month >= 1 && month <= 12) return { year: today.year, month };
    return null;
  }

  const previousYearMonth = monthToken.match(/^(?:작년|지난해)(\d{1,2})월$/);
  if (previousYearMonth) {
    const month = Number(previousYearMonth[1]);
    if (month >= 1 && month <= 12) return { year: today.year - 1, month };
    return null;
  }

  const nextYearMonth = monthToken.match(/^(?:내년|다음해)(\d{1,2})월$/);
  if (nextYearMonth) {
    const month = Number(nextYearMonth[1]);
    if (month >= 1 && month <= 12) return { year: today.year + 1, month };
    return null;
  }

  const monthOnly = monthToken.match(/^(\d{1,2})월$/);
  if (monthOnly) {
    const month = Number(monthOnly[1]);
    if (month >= 1 && month <= 12) return { year: today.year, month };
  }

  return null;
}

function getWeekdayOccurrenceInMonth(date: { year: number; month: number; day: number }): number {
  return Math.floor((date.day - 1) / 7) + 1;
}

function resolveOrdinalWeekdayInMonth(
  year: number,
  month: number,
  ordinal: number,
  weekdayWord: string,
  options?: { clampToLastOccurrence?: boolean },
): string | null {
  const dayOffsetFromMonday = KOREAN_WEEKDAY_FROM_MONDAY[weekdayWord];
  if (dayOffsetFromMonday === undefined) return null;

  const targetJsDay = (dayOffsetFromMonday + 1) % 7;
  const firstDay = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const daysUntilTarget = (targetJsDay - firstDay.getDay() + 7) % 7;
  let day = 1 + daysUntilTarget + (ordinal - 1) * 7;
  const lastDay = lastDayOfMonth(year, month);
  if (day > lastDay) {
    if (!options?.clampToLastOccurrence) return null;
    day -= 7;
  }
  if (day < 1 || day > lastDay) return null;

  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

function formatDotParts(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  const lastDay = lastDayOfMonth(year, month);
  if (day < 1 || day > lastDay) return null;
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

function dayFromPhase(phase: string, year: number, month: number): number {
  if (phase === '초' || phase === '초반' || phase === '초순') return 1;
  if (phase === '중순' || phase === '중반') return 15;
  return lastDayOfMonth(year, month);
}

function resolveRelativeMonthDayDateFromMessage(
  message: string,
  todayDot: string,
): string | null {
  const parsedToday = parseTodayDot(todayDot);
  if (!parsedToday) return null;

  const compact = message.replace(/\s+/g, '');
  const match = compact.match(RELATIVE_MONTH_DAY_RE);
  if (!match) return null;

  const monthInfo = resolveMonthToken(match[1], parsedToday);
  const day = Number(match[2]);
  if (!monthInfo || !Number.isFinite(day)) return null;

  return formatDotParts(monthInfo.year, monthInfo.month, day);
}

function resolveRelativeMonthPhaseDateFromMessage(
  message: string,
  todayDot: string,
): string | null {
  const parsedToday = parseTodayDot(todayDot);
  if (!parsedToday) return null;

  const compact = message.replace(/\s+/g, '');
  const match = compact.match(RELATIVE_MONTH_PHASE_RE);
  if (!match) return null;

  const monthInfo = resolveMonthToken(match[1], parsedToday);
  if (!monthInfo) return null;

  return formatDotParts(
    monthInfo.year,
    monthInfo.month,
    dayFromPhase(match[2], monthInfo.year, monthInfo.month),
  );
}

function resolveRelativeYearPhaseDateFromMessage(
  message: string,
  todayDot: string,
): string | null {
  const parsedToday = parseTodayDot(todayDot);
  if (!parsedToday) return null;

  const compact = message.replace(/\s+/g, '');
  const match = compact.match(RELATIVE_YEAR_PHASE_RE);
  if (!match) return null;

  let year = parsedToday.year;
  if (match[1] === '작년' || match[1] === '지난해') year -= 1;
  if (match[1] === '내년' || match[1] === '다음해') year += 1;

  const phase = match[2];
  const month = phase === '초' || phase === '초반' || phase === '초순' ? 1 : phase === '중순' || phase === '중반' ? 6 : 12;
  return formatDotParts(year, month, dayFromPhase(phase, year, month));
}

function resolveRelativeMonthOrdinalWeekdayDateFromMessage(
  message: string,
  todayDot: string,
): string | null {
  const parsedToday = parseTodayDot(todayDot);
  if (!parsedToday) return null;

  const compact = message.replace(/\s+/g, '');
  const match = compact.match(RELATIVE_MONTH_ORDINAL_WEEKDAY_RE);
  if (!match) return null;

  const monthInfo = resolveMonthToken(match[1], parsedToday);
  const ordinal = ordinalWeekFromToken(match[2]);
  if (!monthInfo || ordinal === undefined) return null;

  const weekdayWord = match[3] ?? KOREAN_WEEKDAY_FROM_JS[
    new Date(parsedToday.year, parsedToday.month - 1, parsedToday.day, 12, 0, 0, 0).getDay()
  ];

  return resolveOrdinalWeekdayInMonth(monthInfo.year, monthInfo.month, ordinal, weekdayWord);
}

function resolveRelativeMonthWeekdayDateFromMessage(
  message: string,
  todayDot: string,
): string | null {
  const parsedToday = parseTodayDot(todayDot);
  if (!parsedToday) return null;

  const compact = message.replace(/\s+/g, '');
  const match = compact.match(RELATIVE_MONTH_WEEKDAY_RE);
  if (!match) return null;

  const monthInfo = resolveMonthToken(match[1], parsedToday);
  if (!monthInfo) return null;

  return resolveOrdinalWeekdayInMonth(
    monthInfo.year,
    monthInfo.month,
    getWeekdayOccurrenceInMonth(parsedToday),
    match[2],
    { clampToLastOccurrence: true },
  );
}

function resolveRelativeAgoDateFromMessage(
  message: string,
  todayDot: string,
): string | null {
  const parsedToday = parseTodayDot(todayDot);
  if (!parsedToday) return null;

  const compact = message.replace(/\s+/g, '');
  const match = compact.match(RELATIVE_AGO_RE);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const date = new Date(parsedToday.year, parsedToday.month - 1, parsedToday.day, 12, 0, 0, 0);
  if (unit === '일') {
    date.setDate(date.getDate() - amount);
  } else if (unit === '주') {
    date.setDate(date.getDate() - amount * 7);
  } else {
    date.setMonth(date.getMonth() - amount);
  }

  return formatDotDate(date);
}

/**
 * 절대 날짜·상대 말일(오늘/어제 등)·N월 N일이 있으면 덮어쓰기 하지 않음(모델/사용자 표현 우선).
 */
function hasExplicitCalendarDateHint(message: string): boolean {
  const s = message.trim();
  if (/\d{4}\.\d{1,2}\.\d{1,2}/.test(s)) return true;
  if (/\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) return true;
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true;
  if (/오늘|어제|그제|내일|모레/.test(s)) return true;
  return false;
}

/**
 * 메시지에 (저번주|…)+(요일) 패턴이 있으면 `YYYY.MM.DD`, 없거나 스킵 조건이면 `null`.
 */
export function resolveRelativeWeekdayDateFromMessage(
  message: string,
  todayDot: string,
): string | null {
  if (hasExplicitCalendarDateHint(message)) {
    return null;
  }
  const monthDayDate = resolveRelativeMonthDayDateFromMessage(message, todayDot);
  if (monthDayDate != null) {
    return monthDayDate;
  }
  const monthPhaseDate = resolveRelativeMonthPhaseDateFromMessage(message, todayDot);
  if (monthPhaseDate != null) {
    return monthPhaseDate;
  }
  const yearPhaseDate = resolveRelativeYearPhaseDateFromMessage(message, todayDot);
  if (yearPhaseDate != null) {
    return yearPhaseDate;
  }
  const monthOrdinalDate = resolveRelativeMonthOrdinalWeekdayDateFromMessage(message, todayDot);
  if (monthOrdinalDate != null) {
    return monthOrdinalDate;
  }
  const monthWeekdayDate = resolveRelativeMonthWeekdayDateFromMessage(message, todayDot);
  if (monthWeekdayDate != null) {
    return monthWeekdayDate;
  }
  const agoDate = resolveRelativeAgoDateFromMessage(message, todayDot);
  if (agoDate != null) {
    return agoDate;
  }
  const match = message.match(RELATIVE_WEEKDAY_RE);
  if (!match) {
    return null;
  }
  const weekToken = match[1].replace(/\s+/g, '');
  const dayWord = match[2];
  const weekOffset = weekOffsetFromToken(weekToken);
  const dayOffset = KOREAN_WEEKDAY_FROM_MONDAY[dayWord];
  if (weekOffset === undefined || dayOffset === undefined) {
    return null;
  }
  const parsed = parseTodayDot(todayDot);
  if (!parsed) {
    return null;
  }
  const anchor = new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0);
  const monday0 = startOfMondayWeek(anchor);
  monday0.setDate(monday0.getDate() + 7 * weekOffset + dayOffset);
  return formatDotDate(monday0);
}

function parseDotDate(dateDot: string): { year: number; month: number; day: number } | null {
  const m = dateDot.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return { year, month, day };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + offset, 1, 12, 0, 0, 0);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function resolveSeriesStartMonth(
  message: string,
  today: { year: number; month: number; day: number },
): { year: number; month: number } | null {
  const s = message.replace(/\s+/g, '');

  const ymdStart = s.match(/(\d{4})년(\d{1,2})월(?:부터|시작|이후)/);
  if (ymdStart) {
    const year = Number(ymdStart[1]);
    const month = Number(ymdStart[2]);
    if (Number.isFinite(year) && month >= 1 && month <= 12) return { year, month };
  }

  const currentYearMonth = s.match(/(?:올해|금년)(\d{1,2})월(?:부터|시작|이후)/);
  if (currentYearMonth) {
    const month = Number(currentYearMonth[1]);
    if (month >= 1 && month <= 12) return { year: today.year, month };
  }

  const previousYearMonth = s.match(/(?:작년|지난해)(\d{1,2})월(?:부터|시작|이후)/);
  if (previousYearMonth) {
    const month = Number(previousYearMonth[1]);
    if (month >= 1 && month <= 12) return { year: today.year - 1, month };
  }

  const nextYearMonth = s.match(/(?:내년|다음해)(\d{1,2})월(?:부터|시작|이후)/);
  if (nextYearMonth) {
    const month = Number(nextYearMonth[1]);
    if (month >= 1 && month <= 12) return { year: today.year + 1, month };
  }

  const currentYearMonthLoose = s.match(/(?:올해|금년)(\d{1,2})월/);
  if (currentYearMonthLoose) {
    const month = Number(currentYearMonthLoose[1]);
    if (month >= 1 && month <= 12) return { year: today.year, month };
  }

  const previousYearMonthLoose = s.match(/(?:작년|지난해)(\d{1,2})월/);
  if (previousYearMonthLoose) {
    const month = Number(previousYearMonthLoose[1]);
    if (month >= 1 && month <= 12) return { year: today.year - 1, month };
  }

  const nextYearMonthLoose = s.match(/(?:내년|다음해)(\d{1,2})월/);
  if (nextYearMonthLoose) {
    const month = Number(nextYearMonthLoose[1]);
    if (month >= 1 && month <= 12) return { year: today.year + 1, month };
  }

  if (/(?:올해초|올초|금년초|연초)(?:부터|시작|이후)?/.test(s)) {
    return { year: today.year, month: 1 };
  }

  if (/(?:올해|금년)(?:부터|시작|이후)/.test(s)) {
    return { year: today.year, month: 1 };
  }

  if (/(?:저번달|지난달|전월)(?:부터|시작|이후)/.test(s)) {
    return addMonths(today.year, today.month, -1);
  }

  if (/(?:이번달|금월)(?:부터|시작|이후)/.test(s)) {
    return { year: today.year, month: today.month };
  }

  if (/(?:다음달|내달)(?:부터|시작|이후)/.test(s)) {
    return addMonths(today.year, today.month, 1);
  }

  const monthOnly = s.match(/(\d{1,2})월(?:부터|시작|이후)/);
  if (monthOnly) {
    const month = Number(monthOnly[1]);
    if (month >= 1 && month <= 12) return { year: today.year, month };
  }

  return null;
}

function resolveSeriesDay(message: string): number | 'last' | null {
  const s = message.replace(/\s+/g, '');

  if (/(?:매달|매월|월마다)?(?:말일|월말)/.test(s)) {
    return 'last';
  }

  const recurringDay = s.match(/(?:매달|매월|월마다|매월마다)(\d{1,2})일/);
  if (recurringDay) {
    const day = Number(recurringDay[1]);
    if (day >= 1 && day <= 31) return day;
  }

  const dayOnly = s.match(/(?:^|[^\d])(\d{1,2})일/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) return day;
  }

  return null;
}

/**
 * 반복 지출(정기/할부)의 시작 기간 표현을 `YYYY.MM.DD`로 보정합니다.
 * LLM 호출 시간을 늘리지 않기 위해 짧은 정규식만 사용하고, 시작 기간 힌트가 없으면 건드리지 않습니다.
 */
export function resolveExpenseSeriesStartDateFromMessage(
  message: string,
  todayDot: string,
  fallbackDateDot?: string,
): string | null {
  const today = parseTodayDot(todayDot);
  if (!today) return null;

  const startMonth = resolveSeriesStartMonth(message, today);
  if (!startMonth) return null;

  const fallback = fallbackDateDot ? parseDotDate(fallbackDateDot) : null;
  const resolvedDay = resolveSeriesDay(message);
  const lastDay = lastDayOfMonth(startMonth.year, startMonth.month);
  const day =
    resolvedDay === 'last'
      ? lastDay
      : Math.min(resolvedDay ?? fallback?.day ?? today.day, lastDay);

  return `${startMonth.year}.${String(startMonth.month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}
