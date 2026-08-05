import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * API 엔드포인트 설정
 *
 * - 스테이지(EAS channel stage 또는 applicationId 에 `.stage`): 프리뷰(ing) 기본 도메인.
 * - Expo Go(`appOwnership === 'expo'`): 동일하게 프리뷰 기본 도메인(로컬 개발 시 프로덕션 API 405 등 방지).
 * - 단, EXPO_PUBLIC_AWALLET_API_BASE_URL 이 프로덕션 기본과 다르면 그 호스트를 우선.
 * - 스토어 최소 버전 JSON: 기본은 `{VERCEL_API_BASE_URL}/app-version.json`.
 *   EXPO_PUBLIC_APP_VERSION_POLICY_URL 로 분리 URL 가능(빌드 시 박힘·비밀 아님). 신뢰하는 호스트만 사용.
 * - 공지사항 JSON: `{VERCEL_API_BASE_URL}/app-notices.json` (Vercel static 배포분만 표시).
 *   EXPO_PUBLIC_APP_NOTICES_URL 로 분리 URL 가능.
 * - 그 밖의 프로덕션 빌드: EXPO_PUBLIC 이 있으면 우선, 없으면 프로덕션 기본 도메인.
 */

/** 프로덕션 Vercel 기본 호스트(스테이지 분기 시 `EXPO_PUBLIC` 비교 기준에도 사용) */
const DEFAULT_VERCEL_API_BASE_URL = 'https://awallet-eta.vercel.app';
const DEFAULT_STAGE_VERCEL_API_BASE_URL =
  'https://awallet-git-ing-awallet-vercel-api.vercel.app';

function normalizeApiBaseUrl(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const unquoted = trimmed.replace(/^['"]|['"]$/g, '').trim();
  const normalized = unquoted.replace(/\/+$/, '');
  if (normalized.length === 0) return null;

  try {
    const parsed = new URL(normalized);
    if (!parsed.protocol || !parsed.host) return null;
    return normalized;
  } catch {
    return null;
  }
}

function isStageBuildProfile(): boolean {
  return (
    Updates.channel === 'stage' || Application.applicationId?.includes('.stage') === true
  );
}

/** Expo Go 클라이언트에서 실행 중 (개발용 스캐너 앱) */
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

function shouldUseStageDefaultVercelHost(): boolean {
  return isStageBuildProfile() || isExpoGo();
}

export const VERCEL_API_BASE_URL = (() => {
  const fromEnv = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_AWALLET_API_BASE_URL);

  if (shouldUseStageDefaultVercelHost()) {
    if (fromEnv != null && fromEnv !== DEFAULT_VERCEL_API_BASE_URL) {
      return fromEnv;
    }
    return DEFAULT_STAGE_VERCEL_API_BASE_URL;
  }

  return fromEnv ?? DEFAULT_VERCEL_API_BASE_URL;
})();

/**
 * 스토어 최소 버전 정책(JSON). `static/app-version.json` → Vercel `public/` 복사 후 동일 호스트에서 제공.
 * 스토어 링크는 JSON이 아니라 앱 번들(`app.json`의 스토어 URL)을 쓰므로, 악성 JSON이 가짜 스토어로 보내지는 않음.
 */
export const APP_VERSION_POLICY_URL =
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_APP_VERSION_POLICY_URL) ??
  `${VERCEL_API_BASE_URL}/app-version.json`;

export const APP_NOTICES_URL =
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_APP_NOTICES_URL) ??
  `${VERCEL_API_BASE_URL}/app-notices.json`;

export const PARSE_EXPENSE_API_URL = `${VERCEL_API_BASE_URL}/api/parse-expense`;

export const CONSUMPTION_REPORT_API_URL = `${VERCEL_API_BASE_URL}/api/consumption-report`;
