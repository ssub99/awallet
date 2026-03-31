import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

/**
 * API 엔드포인트 설정
 *
 * 스테이지(EAS channel stage 또는 applicationId 에 `.stage`): 프리뷰 기본 도메인 사용.
 * 단, EXPO_PUBLIC_AWALLET_API_BASE_URL 이 프로덕션과 다른 호스트면 그 값을 사용.
 * 프로덕션 앱: EXPO_PUBLIC 이 있으면 우선, 없으면 프로덕션 기본 도메인.
 */

const DEFAULT_VERCEL_API_BASE_URL = 'https://awallet.vercel.app';
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

const VERCEL_API_BASE_URL = (() => {
  const fromEnv = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_AWALLET_API_BASE_URL);

  if (isStageBuildProfile()) {
    if (fromEnv != null && fromEnv !== DEFAULT_VERCEL_API_BASE_URL) {
      return fromEnv;
    }
    return DEFAULT_STAGE_VERCEL_API_BASE_URL;
  }

  return fromEnv ?? DEFAULT_VERCEL_API_BASE_URL;
})();

export const PARSE_EXPENSE_API_URL = `${VERCEL_API_BASE_URL}/api/parse-expense`;

export const CONSUMPTION_REPORT_API_URL = `${VERCEL_API_BASE_URL}/api/consumption-report`;
