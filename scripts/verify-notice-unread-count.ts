/**
 * 공지 unread 카운트 회귀.
 * 사용: npx tsx scripts/verify-notice-unread-count.ts
 */
import type { AppNotice } from '../utils/fetch-app-notices';
import { countUnreadNotices } from '../utils/notice-read-state';

const INSTALL_AT = Date.parse('2026-08-01T18:00:00.000Z');
const VIEWED_AT = Date.parse('2026-08-02T00:00:00.000Z');

const NOTICES: AppNotice[] = [
  {
    id: 'old',
    title: 'before install',
    dateLabel: '2026.07.01',
    publishedAt: Date.parse('2026-07-01T00:00:00.000Z'),
    body: '',
    images: [],
  },
  {
    id: 'seen',
    title: 'seen after install',
    dateLabel: '2026.08.01',
    publishedAt: Date.parse('2026-08-01T12:00:00.000Z'),
    body: '',
    images: [],
  },
  {
    id: 'unread-a',
    title: 'unread 1',
    dateLabel: '2026.08.03',
    publishedAt: Date.parse('2026-08-03T00:00:00.000Z'),
    body: '',
    images: [],
  },
  {
    id: 'unread-b',
    title: 'unread 2',
    dateLabel: '2026.08.04',
    publishedAt: Date.parse('2026-08-04T00:00:00.000Z'),
    body: '',
    images: [],
  },
];

let failed = 0;

function expect(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    console.error(`[FAIL] ${label}: expected ${expected}, got ${actual}`);
    failed += 1;
  }
}

expect('install 이전 공지 제외', countUnreadNotices(NOTICES, INSTALL_AT, INSTALL_AT), 2);
expect('열람 watermark 이후만 카운트', countUnreadNotices(NOTICES, INSTALL_AT, VIEWED_AT), 2);
expect('열람 직후 0', countUnreadNotices(NOTICES, INSTALL_AT, Date.parse('2026-08-04T00:00:00.000Z')), 0);

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}

console.log('verify-notice-unread-count: OK');
