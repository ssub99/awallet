/**
 * 간편입력(parse-expense)용: 메시지의 (저번주|이번주|다음주)+(요일)을
 * 기준일(today YYYY.MM.DD)과 **월요일 시작 주**로만 계산해 절대일로 바꿉니다.
 * LLM 산술 오류 방지를 위해 API에서 records[].date 덮어쓰기에 사용합니다.
 */

const KOREAN_WEEKDAY_FROM_MONDAY: Record<string, number> = {
  월요일: 0,
  화요일: 1,
  수요일: 2,
  목요일: 3,
  금요일: 4,
  토요일: 5,
  일요일: 6,
};

/** 주 접두 + 요일(전체 이름). 공백은 \s* 로 허용 */
const RELATIVE_WEEKDAY_RE =
  /(저번주|지난주|전주|이번주|금주|이번\s*주|다음주|차주|다음\s*주)\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/;

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

/**
 * 절대 날짜·상대 말일(오늘/어제 등)·N월 N일이 있으면 덮어쓰기 하지 않음(모델/사용자 표현 우선).
 */
function hasExplicitCalendarDateHint(message: string): boolean {
  const s = message.trim();
  if (/\d{4}\.\d{1,2}\.\d{1,2}/.test(s)) return true;
  if (/\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) return true;
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true;
  if (/\d{1,2}월\s*\d{1,2}일/.test(s)) return true;
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
