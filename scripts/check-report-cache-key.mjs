/**
 * 소비 리포트 캐시 키가 일자/월마감/경과일에 흔들리지 않는지 검증.
 * 실패 시 exit 1.
 */
function hashString(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(36);
}

/** challenge.tsx buildReportCacheKey 와 동일 공식 */
function buildReportCacheKey(context) {
  const source = [
    context.year,
    context.month,
    context.monthStartDay,
    context.timezone,
    context.policyFingerprint,
  ].join('|');
  return `consumptionReportCtx_${hashString(source)}`;
}

const base = {
  year: 2026,
  month: 3,
  monthStartDay: 1,
  timezone: 'Asia/Seoul',
  policyFingerprint: 'pf_1o70ghw',
};

const dayA = buildReportCacheKey(base);
const dayB = buildReportCacheKey(base); // 동일 월 인자 → 동일 키
const otherMonth = buildReportCacheKey({ ...base, month: 4 });
const otherStart = buildReportCacheKey({ ...base, monthStartDay: 25 });

const ok =
  dayA === dayB &&
  dayA !== otherMonth &&
  dayA !== otherStart &&
  // 구 공식(일자·마감 포함)과는 달라야 함 — 회귀 시 다시 흔들리는 키로 돌아가면 감지
  dayA !==
    `consumptionReportCtx_${hashString(
      [2026, 3, 1, 0, '2026-03-31', '0', 31, 'Asia/Seoul', 'pf_1o70ghw'].join('|'),
    )}` &&
  dayA !==
    `consumptionReportCtx_${hashString(
      [2026, 3, 1, 0, '2026-03-31', '1', 31, 'Asia/Seoul', 'pf_1o70ghw'].join('|'),
    )}`;

console.log(JSON.stringify({ dayA, otherMonth, otherStart, ok }, null, 2));
if (!ok) process.exit(1);
