/**
 * API 엔드포인트 설정
 *
 * EXPO_PUBLIC_AWALLET_API_BASE_URL 이 설정되어 있으면 우선 사용합니다.
 * 값이 없으면 기존 ing 프리뷰 도메인을 fallback 으로 사용합니다.
 */

const DEFAULT_VERCEL_API_BASE_URL = 'https://awallet-git-ing-awallet-vercel-api.vercel.app';
const VERCEL_API_BASE_URL =
  process.env.EXPO_PUBLIC_AWALLET_API_BASE_URL ?? DEFAULT_VERCEL_API_BASE_URL;

export const PARSE_EXPENSE_API_URL = `${VERCEL_API_BASE_URL}/api/parse-expense`;

export const CONSUMPTION_REPORT_API_URL = `${VERCEL_API_BASE_URL}/api/consumption-report`;
