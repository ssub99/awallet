/**
 * 코드베이스에서 Amplitude `logEvent` / `logScreenView` 호출을 스캔해
 * 이벤트·속성 카탈로그 xlsx를 생성합니다.
 *
 * 사용: node scripts/generate-analytics-event-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['app', 'components', 'contexts', 'utils'];
const EXT = /\.(tsx?)$/;

/** @param {string} s */
function stripStringsAndComments(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next2 = s.slice(i, i + 2);
    if (next2 === '//') {
      i = s.indexOf('\n', i);
      if (i === -1) break;
      out += ' ';
      i++;
      continue;
    }
    if (next2 === '/*') {
      const end = s.indexOf('*/', i + 2);
      if (end === -1) break;
      out += ' '.repeat(end - i + 2);
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += ' ';
      i++;
      while (i < s.length) {
        if (s[i] === '\\') {
          i += 2;
          continue;
        }
        if (s[i] === quote) {
          i++;
          break;
        }
        if (quote === '`' && s[i] === '$' && s[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < s.length && depth > 0) {
            if (s.slice(i, i + 2) === '${') depth++;
            else if (s[i] === '}') depth--;
            i++;
          }
          continue;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * s[i] === '{'. Returns { end, text } or null.
 * @param {string} s
 * @param {number} i
 */
function matchBracedBlock(s, i) {
  if (s[i] !== '{') return null;
  let depth = 0;
  const start = i;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    const prev = s[j - 1];
    if (ch === '/' && s[j + 1] === '/') {
      j = s.indexOf('\n', j);
      if (j === -1) return null;
      continue;
    }
    if (ch === '/' && s[j + 1] === '*') {
      j = s.indexOf('*/', j + 2);
      if (j === -1) return null;
      j += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      j++;
      while (j < s.length) {
        if (s[j] === '\\') {
          j += 2;
          continue;
        }
        if (s[j] === q) break;
        if (q === '`' && s[j] === '$' && s[j + 1] === '{') {
          let d = 1;
          j += 2;
          while (j < s.length && d > 0) {
            if (s.slice(j, j + 2) === '${') d++;
            else if (s[j] === '}') d--;
            j++;
          }
          continue;
        }
        j++;
      }
      continue;
    }
    if (ch === '{' && prev !== '$') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { end: j, text: s.slice(start, j + 1) };
      }
    }
  }
  return null;
}

/**
 * 객체 리터럴 문자열에서 depth 0 프로퍼티 키만 수집
 * @param {string} objText
 */
function topLevelKeys(objText) {
  const inner = objText.slice(1, -1);
  const cleaned = stripStringsAndComments(inner);
  const keys = new Set();
  let depth = 0;
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const m = cleaned.slice(i).match(/^([a-zA-Z_$][\w$]*)\s*:/);
      if (m) {
        keys.add(m[1]);
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return [...keys].sort();
}

/**
 * @param {string} filePath
 * @param {string} content
 * @returns {{ kind: string, event: string, line: number, keys: string[], snippet: string, note?: string }[]}
 */
function scanLogEventCalls(filePath, content) {
  const rel = path.relative(ROOT, filePath);
  const rows = [];
  const needle = 'logEvent(';
  let pos = 0;
  while (true) {
    const idx = content.indexOf(needle, pos);
    if (idx === -1) break;
    const declProbe = content.slice(Math.max(0, idx - 35), idx + 9);
    if (/\bfunction\s+logEvent\s*\(/.test(declProbe)) {
      pos = idx + needle.length;
      continue;
    }
    const line = content.slice(0, idx).split('\n').length;
    let i = idx + needle.length;
    while (i < content.length && /\s/.test(content[i])) i++;

    let eventName = null;
    let note = '';

    if (content[i] === "'" || content[i] === '"') {
      const q = content[i];
      let j = i + 1;
      let name = '';
      while (j < content.length) {
        if (content[j] === '\\') {
          name += content[j + 1] ?? '';
          j += 2;
          continue;
        }
        if (content[j] === q) {
          eventName = name;
          i = j + 1;
          break;
        }
        name += content[j];
        j++;
      }
    } else {
      const rest = content.slice(i, i + 40);
      eventName = '(동적 이벤트명)';
      note = `첫 인자가 리터럴이 아님: ${rest.replace(/\s+/g, ' ').slice(0, 60)}`;
    }

    while (i < content.length && /\s/.test(content[i])) i++;
    if (content[i] === ',') i++;
    while (i < content.length && /\s/.test(content[i])) i++;

    let keys = [];
    let snippet = '';
    if (content[i] === '{') {
      const block = matchBracedBlock(content, i);
      if (block) {
        keys = topLevelKeys(block.text);
        snippet = block.text.replace(/\s+/g, ' ').trim().slice(0, 200);
      }
    }

    rows.push({
      kind: 'logEvent',
      event: eventName ?? '(파싱 실패)',
      line,
      keys,
      snippet,
      note,
      file: rel,
    });
    pos = idx + needle.length;
  }
  return rows;
}

/**
 * Amplitude로 전달되는 최종 이벤트명과 (고정) 속성 키 — 호출은 래퍼를 통해 이뤄짐
 */
const ANALYTICS_WRAPPERS = [
  {
    fn: 'logExpenseAdjustment',
    emits: 'expense_adjustment',
    keys: ['record_type', 'adjustment', 'state', 'refund_scope', 'expense_variant', 'app_runtime'],
  },
  {
    fn: 'logExpenseCreate',
    emits: 'record_created',
    keys: [
      'record_type',
      'expense_variant',
      'repeat_kind',
      'period_months',
      'weekend_option',
      'settlement_kind',
      'refund_scope',
      'app_runtime',
    ],
  },
  {
    fn: 'logExpenseDelete',
    emits: 'record_deleted',
    keys: [
      'record_type',
      'expense_variant',
      'repeat_kind',
      'period_months',
      'weekend_option',
      'settlement_kind',
      'refund_scope',
      'app_runtime',
    ],
  },
  {
    fn: 'logChallengeCreate',
    emits: 'record_created',
    keys: ['record_type', 'challenge_variant', 'is_recurring', 'duration_months', 'app_runtime'],
  },
  {
    fn: 'logChallengeDelete',
    emits: 'record_deleted',
    keys: ['record_type', 'challenge_variant', 'is_recurring', 'duration_months', 'app_runtime'],
  },
  {
    fn: 'logRecordLifecycleCount',
    emits: '(create→record_created / delete→record_deleted)',
    keys: ['record_type', 'repeat_count', 'repeat_kind', 'app_runtime'],
  },
];

/**
 * @param {string} filePath
 * @param {string} content
 */
function scanWrapperCalls(filePath, content) {
  const rel = path.relative(ROOT, filePath);
  const rows = [];
  for (const w of ANALYTICS_WRAPPERS) {
    const needle = `${w.fn}(`;
    let pos = 0;
    while (true) {
      const idx = content.indexOf(needle, pos);
      if (idx === -1) break;
      const declProbe = content.slice(Math.max(0, idx - 40), idx + needle.length + 2);
      if (/\bfunction\s+\w+\s*\(/.test(declProbe) && declProbe.includes(`function ${w.fn}`)) {
        pos = idx + needle.length;
        continue;
      }
      const line = content.slice(0, idx).split('\n').length;
      rows.push({
        래퍼_함수: w.fn,
        Amplitude_이벤트명: w.emits,
        출처_파일: rel,
        출처_줄: line,
        전송_속성_키: w.keys.join(', '),
      });
      pos = idx + needle.length;
    }
  }
  return rows;
}

function scanLogScreenView(filePath, content) {
  const rel = path.relative(ROOT, filePath);
  const rows = [];
  const needle = 'logScreenView(';
  let pos = 0;
  while (true) {
    const idx = content.indexOf(needle, pos);
    if (idx === -1) break;
    const declProbe = content.slice(Math.max(0, idx - 35), idx + 15);
    if (/\bfunction\s+logScreenView\s*\(/.test(declProbe)) {
      pos = idx + needle.length;
      continue;
    }
    const line = content.slice(0, idx).split('\n').length;
    rows.push({
      kind: 'logScreenView',
      event: 'screen_view',
      line,
      keys: ['screen_name', '...(params)', 'app_runtime'],
      snippet: 'track in utils/analytics.ts',
      note: '추가 params는 라우트 리스너 등 호출부에서 전달',
      file: rel,
    });
    pos = idx + needle.length;
  }
  return rows;
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (EXT.test(name)) acc.push(p);
  }
}

const files = [];
for (const d of SCAN_DIRS) {
  walk(path.join(ROOT, d), files);
}

const allRows = [];
const wrapperRows = [];
for (const fp of files) {
  const content = fs.readFileSync(fp, 'utf8');
  allRows.push(...scanLogEventCalls(fp, content));
  allRows.push(...scanLogScreenView(fp, content));
  wrapperRows.push(...scanWrapperCalls(fp, content));
}

const filtered = allRows;

/** 정적 이벤트 스키마 (utils/analytics.ts 기준) */
const schemaRows = [
  {
    이벤트명: 'app_started',
    속성명: 'timestamp',
    속성_역할: 'number',
    출처: 'utils/analytics (호출: app/_layout.tsx)',
    비고: '앱 cold start 직후',
  },
  {
    이벤트명: 'app_started',
    속성명: 'platform',
    속성_역할: 'string',
    출처: 'app/_layout.tsx',
    비고: 'React Native Platform.OS',
  },
  {
    이벤트명: 'app_started',
    속성명: 'environment',
    속성_역할: "'development' | 'production'",
    출처: 'app/_layout.tsx',
    비고: '',
  },
  {
    이벤트명: 'record_created',
    속성명: 'record_type',
    속성_역할: "'expense' | 'challenge' | (income은 logRecordLifecycleCount)",
    출처: 'utils/analytics.ts',
    비고: '소비/챌린지 생성 시 상세 속성 포함',
  },
  {
    이벤트명: 'record_created',
    속성명: 'expense_variant',
    속성_역할: 'ExpenseCreationVariant',
    출처: 'utils/analytics.ts',
    비고: 'general | repeated_isrecurring | repeated_isinstallment',
  },
  {
    이벤트명: 'record_created',
    속성명: 'challenge_variant',
    속성_역할: 'ChallengeCreationVariant',
    출처: 'utils/analytics.ts',
    비고: 'general | isrecurring',
  },
  {
    이벤트명: 'record_created',
    속성명: 'repeat_kind, period_months, weekend_option, settlement_kind, refund_scope',
    속성_역할: 'ExpenseLifecycleAnalyticsPayload',
    출처: 'utils/analytics.ts',
    비고: '소비(record_type=expense)일 때',
  },
  {
    이벤트명: 'record_created',
    속성명: 'is_recurring, duration_months',
    속성_역할: 'ChallengeLifecycleAnalyticsPayload',
    출처: 'utils/analytics.ts',
    비고: '챌린지(record_type=challenge)일 때',
  },
  {
    이벤트명: 'record_deleted',
    속성명: '(record_created와 동일 키 세트)',
    속성_역할: '동일',
    출처: 'utils/analytics.ts',
    비고: '삭제 1회당 1이벤트',
  },
  {
    이벤트명: 'record_deleted',
    속성명: 'record_type',
    속성_역할: "'income' | 'expense' | 'challenge'",
    출처: 'logRecordLifecycleCount',
    비고: '간단 삭제 카운트용',
  },
  {
    이벤트명: 'expense_adjustment',
    속성명: 'record_type',
    속성_역할: "'expense'",
    출처: 'utils/analytics.ts',
    비고: '',
  },
  {
    이벤트명: 'expense_adjustment',
    속성명: 'adjustment, state, refund_scope, expense_variant',
    속성_역할: 'ExpenseAdjustmentAnalyticsPayload',
    출처: 'utils/analytics.ts',
    비고: '선결제/환불/결산 토글 및 복구',
  },
  {
    이벤트명: '(모든 logEvent)',
    속성명: 'app_runtime',
    속성_역할: 'string',
    출처: 'utils/analytics.ts logEvent',
    비고: '페이로드에 자동 병합',
  },
  {
    이벤트명: 'screen_view',
    속성명: 'screen_name, app_runtime, ...(params)',
    속성_역할: 'string + optional',
    출처: 'utils/analytics.ts logScreenView',
    비고: '예: mode (analytics-route-listener)',
  },
];

const detailRows = filtered.flatMap((r) => {
  if (r.keys.length === 0) {
    return [
      {
        이벤트명: r.event,
        이벤트_종류: r.kind,
        속성명: '(객체 없음 또는 파싱 실패)',
        출처_파일: r.file,
        출처_줄: r.line,
        객체_발췌: r.snippet,
        비고: r.note || '',
      },
    ];
  }
  return r.keys.map((k) => ({
    이벤트명: r.event,
    이벤트_종류: r.kind,
    속성명: k,
    출처_파일: r.file,
    출처_줄: r.line,
    객체_발췌: r.snippet,
    비고: r.note || '',
  }));
});

const summaryMap = new Map();
for (const r of filtered) {
  const k = r.event;
  if (!summaryMap.has(k)) summaryMap.set(k, { 이벤트명: k, 호출_건수: 0, 파일들: new Set() });
  const s = summaryMap.get(k);
  s.호출_건수++;
  s.파일들.add(r.file);
}
const summaryRows = [...summaryMap.values()].map((s) => ({
  이벤트명: s.이벤트명,
  호출_건수: s.호출_건수,
  관련_파일_수: s.파일들.size,
}));

const wb = XLSX.utils.book_new();
// 구글 시트 '이벤트 속성' 탭과 유사: 호출별 속성 키 → 요약·스키마 순
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), '이벤트_속성');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), '이벤트_현황');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schemaRows), '도메인_이벤트_스키마');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wrapperRows), '래퍼_호출_매핑');

const outPath = path.join(ROOT, 'docs', 'analytics-events-catalog.xlsx');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);
console.log(
  `Wrote ${path.relative(ROOT, outPath)} (${detailRows.length} property rows, ${summaryRows.length} unique events, ${wrapperRows.length} wrapper call sites)`,
);
