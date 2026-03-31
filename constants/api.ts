import * as Application from 'expo-application';

/**
 * API 엔드포인트 설정
 *
 * EXPO_PUBLIC_AWALLET_API_BASE_URL 이 설정되어 있으면 우선 사용합니다.
 * 값이 없으면 프로덕션 고정 도메인을 fallback 으로 사용합니다.
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

const VERCEL_API_BASE_URL =
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_AWALLET_API_BASE_URL) ??
  (Application.applicationId?.includes('.stage')
    ? DEFAULT_STAGE_VERCEL_API_BASE_URL
    : DEFAULT_VERCEL_API_BASE_URL);

export const PARSE_EXPENSE_API_URL = `${VERCEL_API_BASE_URL}/api/parse-expense`;

export const CONSUMPTION_REPORT_API_URL = `${VERCEL_API_BASE_URL}/api/consumption-report`;
