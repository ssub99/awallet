/**
 * 단축어 재설정 게이트 — 버전 임계 셀프체크 (RN/Expo 없이).
 * 실행: npx tsx scripts/verify-record-inbox-shortcut-resync.ts
 */

function isAtLeastVersion(current: string | undefined, min: string): boolean {
  if (current == null || current === '') return false;
  const c = current.split('.').map((n) => parseInt(n, 10) || 0);
  const m = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(c.length, m.length); i++) {
    const cv = c[i] ?? 0;
    const mv = m[i] ?? 0;
    if (cv > mv) return true;
    if (cv < mv) return false;
  }
  return true;
}

const MIN = '1.2.4';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(MIN === '1.2.4', 'threshold');
assert(!isAtLeastVersion('1.2.3', MIN), '1.2.3 < 1.2.4');
assert(isAtLeastVersion('1.2.4', MIN), '1.2.4 >= 1.2.4');
assert(isAtLeastVersion('1.2.5', MIN), '1.2.5 >= 1.2.4');
assert(isAtLeastVersion('1.3.0', MIN), '1.3.0 >= 1.2.4');
assert(!isAtLeastVersion(undefined, MIN), 'undefined');
assert(!isAtLeastVersion('', MIN), 'empty');

console.log('verify-record-inbox-shortcut-resync: PASS');
