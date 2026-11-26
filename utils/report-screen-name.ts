/**
 * 리포트 화면 분석용 화면 이름 (screen_view · 이벤트 screen_name 공통).
 * 리포트는 한 라우트(/report) 안에서 서브 탭으로 갈리므로 라우트 경로 대신 아래 이름을 쓴다.
 *
 * 리포트
 * ├─ 소비 리포트 → /consumption
 * └─ 소비 현황   → /trend
 */
export const REPORT_CONSUMPTION_SCREEN_NAME = '/consumption';
export const REPORT_TREND_SCREEN_NAME = '/trend';

/** 리포트가 지금 보여 주는 서브 탭의 화면 이름. 리포트 밖의 전역 UI가 이벤트를 남길 때 쓴다 */
let currentReportScreenName: string | null = null;

export function setCurrentReportScreenName(screenName: string): void {
  currentReportScreenName = screenName;
}

export function getCurrentReportScreenName(): string | null {
  return currentReportScreenName;
}
