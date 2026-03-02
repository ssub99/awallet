/**
 * API 엔드포인트 설정
 *
 * 현재는 ing 브랜치용 Vercel 프리뷰 도메인을 사용하고 있습니다.
 * 나중에 프로덕션/스테이지를 분리할 경우, 이 파일만 교체하면 됩니다.
 */

const VERCEL_API_BASE_URL = 'https://awallet-git-ing-awallet-vercel-api.vercel.app';

export const PARSE_EXPENSE_API_URL = `${VERCEL_API_BASE_URL}/api/parse-expense`;

export const CONSUMPTION_REPORT_API_URL = `${VERCEL_API_BASE_URL}/api/consumption-report`;
