import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

/**
 * API 엔드포인트 (JS만 수정하면 eas update 로 배포 가능)
 *
 * - 스토어 프로덕션: 기본 awallet.vercel.app (env로 덮어쓰기 가능)
 * - 스테이지: 번들 ID에 `.stage` 또는 Updates.channel === 'stage'
 *   → EAS에 프로덕션 URL이 실수로 박혀 있어도(405 대비) Preview를 쓴다.
 *   → Preview가 아닌 다른 호스트를 쓰려면 EXPO_PUBLIC_AWALLET_API_BASE_URL 에
 *     awallet.vercel.app 이 아닌 URL을 넣는다.
 *
 * Expo Go는 channel 이 비어 프로덕션 URL이 될 수 있음 → npm run start:ing 으로 env 주입.
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

const isStageProfile =
  Application.applicationId?.includes('.stage') === true || Updates.channel === 'stage';

const VERCEL_API_BASE_URL = (() => {
  const fromEnv = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_AWALLET_API_BASE_URL);

  if (isStageProfile) {
    if (fromEnv != null && fromEnv !== DEFAULT_VERCEL_API_BASE_URL) {
      return fromEnv;
    }
    return DEFAULT_STAGE_VERCEL_API_BASE_URL;
  }

  return fromEnv ?? DEFAULT_VERCEL_API_BASE_URL;
})();

export const PARSE_EXPENSE_API_URL = `${VERCEL_API_BASE_URL}/api/parse-expense`;

export const CONSUMPTION_REPORT_API_URL = `${VERCEL_API_BASE_URL}/api/consumption-report`;
