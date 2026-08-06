/**
 * 앱 버전 비교 (간편입력·강제 업데이트 등 버전 게이트용).
 * 스토어/설정에 표시되는 네이티브 버전을 우선하고, 없으면 expoConfig.version을 씀.
 */

import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** iOS CFBundleShortVersionString / Android versionName (스토어·설정과 동일) */
export function getAppVersion(): string | undefined {
  const native = Application.nativeApplicationVersion?.trim();
  if (native != null && native.length > 0) {
    return native;
  }
  const fromConfig = Constants.expoConfig?.version?.trim();
  return fromConfig != null && fromConfig.length > 0 ? fromConfig : undefined;
}

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
