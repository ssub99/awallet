/**
 * 기록 수신함 OS 아이콘 뱃지 개수 공식 검증.
 * badge = max(0, lastSynced) + pendingCount
 *
 * run: npx tsx scripts/verify-record-inbox-icon-badge.ts
 */

function iconBadgeCount(lastSynced: number, pendingCount: number): number {
  return Math.max(0, Math.floor(lastSynced)) + Math.max(0, Math.floor(pendingCount));
}

type Case = {
  name: string;
  lastSynced: number;
  pendingCount: number;
  expected: number;
};

const cases: Case[] = [
  { name: 'empty', lastSynced: 0, pendingCount: 0, expected: 0 },
  { name: 'inbox only', lastSynced: 3, pendingCount: 0, expected: 3 },
  { name: 'pending only (app killed)', lastSynced: 0, pendingCount: 2, expected: 2 },
  { name: 'both', lastSynced: 5, pendingCount: 1, expected: 6 },
  { name: 'after process all', lastSynced: 0, pendingCount: 0, expected: 0 },
  { name: 'negative synced clamped', lastSynced: -2, pendingCount: 1, expected: 1 },
];

let failed = 0;
for (const c of cases) {
  const got = iconBadgeCount(c.lastSynced, c.pendingCount);
  if (got !== c.expected) {
    console.error(`FAIL ${c.name}: expected ${c.expected}, got ${got}`);
    failed += 1;
  } else {
    console.log(`PASS ${c.name}: ${got}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log('record-inbox-icon-badge: all passed');
