import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

/**
 * API 엔드포인트 설정
 *
 * EXPO_PUBLIC_AWALLET_API_BASE_URL 이 설정되어 있으면 우선 사용합니다.
 * 값이 없으면 아래 중 하나이면 스테이지용 Vercel Preview URL을 씁니다.
 * - applicationId에 `.stage` 포함 (예: iOS 스테이지 타깃)
 * - EAS Update channel이 `stage` (Android 등 번들 ID에 stage가 없어도 동일 채널이면 Preview)
 *
 * 프로덕션(또는 channel 미설정)은 awallet.vercel.app 을 씁니다.
 * Expo Go·dev 클라이언트는 channel이 null 이라 프로덕션 URL이 되며,
 * ing Preview를 쓰려면 `npm run start:ing` 등으로 env를 주입하세요.
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

const isStageApiBase =
  Application.applicationId?.includes('.stage') === true || Updates.channel === 'stage';

const VERCEL_API_BASE_URL =
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_AWALLET_API_BASE_URL) ??
  (isStageApiBase ? DEFAULT_STAGE_VERCEL_API_BASE_URL : DEFAULT_VERCEL_API_BASE_URL);

export const PARSE_EXPENSE_API_URL = `${VERCEL_API_BASE_URL}/api/parse-expense`;

export const CONSUMPTION_REPORT_API_URL = `${VERCEL_API_BASE_URL}/api/consumption-report`;
