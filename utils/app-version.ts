/**
 * 앱 버전 비교 (간편입력 등 버전 게이트용).
 * Constants.expoConfig?.version과 함께 사용.
 */

/** current가 min 이상이면 true. undefined/빈 문자열이면 false (구버전으로 간주) */
export function isAtLeastVersion(current: string | undefined, min: string): boolean {
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

/** 간편입력 기능 사용 가능 최소 버전 */
export const QUICK_INPUT_MIN_VERSION = '1.0.3';
