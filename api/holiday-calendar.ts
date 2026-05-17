const HOLIDAY_API_BASE_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

const HOLIDAY_API_ENDPOINTS = ['getHoliDeInfo', 'getAnniversaryInfo'] as const;

interface KoreanHoliday {
  name: string;
  date: string;
}

type HolidayResolveResult =
  | { status: 'not_holiday' }
  | { status: 'matched'; date: string }
  | { status: 'unresolved' };

interface PublicHolidayItem {
  dateName?: unknown;
  locdate?: unknown;
}

interface PublicHolidayResponse {
  response?: {
    header?: {
      resultCode?: unknown;
      resultMsg?: unknown;
    };
    body?: {
      items?: {
        item?: PublicHolidayItem | PublicHolidayItem[];
      } | '' | null;
    };
  };
}

const holidayCache = new Map<number, Promise<KoreanHoliday[]>>();

const HOLIDAY_ALIASES: Record<string, readonly string[]> = {
  신정: ['1월1일'],
  설: ['설날'],
  구정: ['설날'],
  한가위: ['추석'],
  성탄절: ['기독탄신일', '크리스마스'],
  크리스마스: ['기독탄신일', '성탄절'],
  석가탄신일: ['부처님오신날'],
  석탄일: ['부처님오신날'],
  부처님오신날: ['석가탄신일'],
  삼일절: ['3·1절', '3.1절'],
  '3.1절': ['3·1절', '삼일절'],
  근로자의날: ['근로자의 날'],
};

const HOLIDAY_HINT_RE =
  /공휴일|대체공휴일|임시공휴일|신정|설날|구정|추석|한가위|어린이날|제헌절|광복절|삼일절|3\.1절|현충일|개천절|한글날|성탄절|크리스마스|기독탄신일|부처님\s*오신\s*날|석가탄신일|석탄일|근로자의\s*날/;

function normalizeHolidayName(value: string): string {
  return value.replace(/\s+/g, '').replace(/[·ㆍ]/g, '.').toLowerCase();
}

function parseTodayDot(todayDot: string): { year: number; month: number; day: number } | null {
  const m = todayDot.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function resolveYearFromMessage(message: string, today: { year: number; month: number; day: number }): number {
  const compact = message.replace(/\s+/g, '');
  const explicitYear = compact.match(/(\d{4})년/);
  if (explicitYear) {
    const year = Number(explicitYear[1]);
    if (Number.isFinite(year)) return year;
  }
  if (/작년|지난해/.test(compact)) return today.year - 1;
  if (/내년|다음해/.test(compact)) return today.year + 1;
  return today.year;
}

function formatLocdate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

function getApiKey(): string {
  const apiKey = process.env.KOREA_HOLIDAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('KOREA_HOLIDAY_API_KEY is not configured');
  }
  return apiKey;
}

function buildHolidayUrl(endpoint: (typeof HOLIDAY_API_ENDPOINTS)[number], year: number, month: number): string {
  const apiKey = getApiKey();
  const serviceKey = apiKey.includes('%') ? apiKey : encodeURIComponent(apiKey);
  const solMonth = String(month).padStart(2, '0');
  return `${HOLIDAY_API_BASE_URL}/${endpoint}?serviceKey=${serviceKey}&solYear=${year}&solMonth=${solMonth}&numOfRows=100&_type=json`;
}

function normalizePublicHolidayItems(raw: PublicHolidayItem | PublicHolidayItem[] | '' | null | undefined): PublicHolidayItem[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function readPublicHolidayItems(data: PublicHolidayResponse): PublicHolidayItem | PublicHolidayItem[] | '' | null | undefined {
  const items = data.response?.body?.items;
  if (!items) return null;
  if (typeof items === 'string') return items;
  return items.item;
}

async function fetchHolidayMonth(endpoint: (typeof HOLIDAY_API_ENDPOINTS)[number], year: number, month: number): Promise<KoreanHoliday[]> {
  const res = await fetch(buildHolidayUrl(endpoint, year, month));
  if (!res.ok) {
    throw new Error(`[holiday-calendar] API HTTP ${res.status}`);
  }

  const data = (await res.json()) as PublicHolidayResponse;
  const resultCode = String(data.response?.header?.resultCode ?? '');
  if (resultCode && resultCode !== '00') {
    const resultMsg = String(data.response?.header?.resultMsg ?? 'unknown error');
    throw new Error(`[holiday-calendar] API result ${resultCode}: ${resultMsg}`);
  }

  return normalizePublicHolidayItems(readPublicHolidayItems(data))
    .map((item) => {
      const name = typeof item.dateName === 'string' ? item.dateName.trim() : '';
      const date = formatLocdate(item.locdate);
      return name && date ? { name, date } : null;
    })
    .filter((item): item is KoreanHoliday => item != null);
}

async function fetchKoreanHolidays(year: number): Promise<KoreanHoliday[]> {
  const results = await Promise.all(
    HOLIDAY_API_ENDPOINTS.flatMap((endpoint) =>
      Array.from({ length: 12 }, (_, index) => fetchHolidayMonth(endpoint, year, index + 1)),
    ),
  );

  const deduped = new Map<string, KoreanHoliday>();
  for (const holiday of results.flat()) {
    deduped.set(`${holiday.date}:${normalizeHolidayName(holiday.name)}`, holiday);
  }
  return [...deduped.values()];
}

async function getKoreanHolidays(year: number): Promise<KoreanHoliday[]> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const promise = fetchKoreanHolidays(year).catch((error) => {
    holidayCache.delete(year);
    throw error;
  });
  holidayCache.set(year, promise);
  return promise;
}

function buildCandidateNames(message: string): string[] {
  const compact = message.replace(/\s+/g, '');
  const candidates = new Set<string>();

  for (const holiday of [...Object.keys(HOLIDAY_ALIASES), ...Object.values(HOLIDAY_ALIASES).flat()]) {
    if (compact.includes(holiday)) {
      candidates.add(holiday);
      for (const aliasTarget of HOLIDAY_ALIASES[holiday] ?? []) {
        candidates.add(aliasTarget);
      }
    }
  }

  return [...candidates].map(normalizeHolidayName);
}

export function hasHolidayDateHint(message: string): boolean {
  return HOLIDAY_HINT_RE.test(message);
}

export async function resolveHolidayDateFromMessage(
  message: string,
  todayDot: string,
): Promise<HolidayResolveResult> {
  if (!hasHolidayDateHint(message)) {
    return { status: 'not_holiday' };
  }

  const today = parseTodayDot(todayDot);
  if (!today) {
    return { status: 'unresolved' };
  }

  const candidateNames = buildCandidateNames(message);
  if (candidateNames.length === 0) {
    return { status: 'unresolved' };
  }

  const year = resolveYearFromMessage(message, today);
  const holidays = await getKoreanHolidays(year);
  const matched = holidays.find((holiday) => {
    const normalizedName = normalizeHolidayName(holiday.name);
    return candidateNames.some(
      (candidate) => normalizedName.includes(candidate) || candidate.includes(normalizedName),
    );
  });

  return matched ? { status: 'matched', date: matched.date } : { status: 'unresolved' };
}
