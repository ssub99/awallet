/**
 * 카테고리 이모지 → 대표색 표 생성 (constants/emoji-tint-colors.ts).
 *
 * 앱에는 이모지 글자의 픽셀을 읽을 방법이 없어서, 앱에서 쓰는 이모지 전체를 미리 렌더링해 대표색을 계산해 둔다.
 * 대상: 이모지 선택기(app/category-create.tsx EMOJI_CATEGORIES) + 기본 카테고리 + 기본값.
 *
 * 사용 (macOS 전용 — Apple Color Emoji + swift 필요): node scripts/generate-emoji-tint-colors.mjs
 * 이모지 목록이 바뀌면 다시 실행한다.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** 변형 선택자(FE0F)·피부색 수식자를 뗀 조회 키 — utils/emoji-tint.ts와 동일 규칙 */
const normalize = (emoji) => emoji.replace(/️/g, '').replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const pickerSource = read('app/category-create.tsx');
const pickerStart = pickerSource.indexOf('export const EMOJI_CATEGORIES');
const pickerEnd = pickerSource.indexOf('\n};', pickerStart);
const picker = [...pickerSource.slice(pickerStart, pickerEnd).matchAll(/'([^'\n]+)'/g)].map((m) => m[1]);

const defaults = [...read('constants/categories.ts').matchAll(/emoji:\s*'([^']+)'/g)].map((m) => m[1]);
const extras = ['💰', '📝']; // 리스트뷰 기록 행의 기본 이모지(수입 / 기타)

const byKey = new Map();
for (const emoji of [...picker, ...defaults, ...extras]) {
  if (!byKey.has(normalize(emoji))) byKey.set(normalize(emoji), emoji);
}
const entries = [...byKey.entries()];
console.log(`이모지 ${entries.length}개 렌더링 중...`);

const run = spawnSync('swift', [path.join(__dirname, 'emoji-tint/dominant-color.swift')], {
  input: entries.map(([, emoji]) => emoji).join('\n') + '\n',
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (run.status !== 0) {
  console.error(run.stderr);
  process.exit(run.status ?? 1);
}

const colorByEmoji = new Map(
  run.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')),
);

const lines = [];
let neutral = 0;
for (const [key, emoji] of entries) {
  const color = colorByEmoji.get(emoji);
  if (!color || color === '-') {
    neutral += 1;
    continue; // 대표색 없음 → 앱이 기본 회색 배경을 쓴다
  }
  lines.push(`  '${key}': '${color}',`);
}

const out = `/**
 * 이모지 → 대표색 (생성 파일 — 직접 수정하지 말 것).
 * 생성: node scripts/generate-emoji-tint-colors.mjs  (macOS, Apple Color Emoji 렌더링 기준)
 *
 * 표에 없는 이모지(대표색 없음 포함)는 앱이 기본 회색 배경을 쓴다.
 * 키는 변형 선택자(FE0F)·피부색 수식자를 뗀 형태 — utils/emoji-tint.ts 참고.
 */
export const EMOJI_TINT_COLORS: Readonly<Record<string, string>> = {
${lines.join('\n')}
};
`;
fs.writeFileSync(path.join(ROOT, 'constants/emoji-tint-colors.ts'), out);
console.log(`저장: 색 있음 ${lines.length} / 대표색 없음(기본 회색) ${neutral} / 전체 ${entries.length}`);
