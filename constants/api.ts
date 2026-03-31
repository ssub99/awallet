import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

/**
 * API 베이스 URL — **JS만 변경하면 eas update 로 배포** (네이티브 재빌드·심사 불필요)
 *
 * 검증(2026-03-31): POST /api/consumption-report 는 Preview 200, awallet.vercel.app 405.
 * 스테이지가 프로덕션 URL만 쓰면 AI API가 실패할 수 있음.
 *
 * 스테이지 판별: applicationId에 `.stage` 또는 EAS Update channel `stage`
 * (Android는 번들 ID에 stage가 없는 경우가 많아 channel 필요)
 *
 * 스테이지에서는 env가 비어 있거나 **awallet.vercel.app 과 동일**이면 Preview 사용.
 * 다른 호스트를 쓰려면 awallet.vercel.app 이 아닌 URL을 EXPO_PUBLIC_AWALLET_API_BASE_URL 에 둠.
 *
 * 대안: Vercel 프로덕션에서 POST 라우팅을 고치면 프로덕션 URL만으로도 동작하지만,
 * 그건 서버 배포 이슈이며 앱 OTA와 별개.
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
