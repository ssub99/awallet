import { getCurrentReportScreenName } from '@/utils/report-screen-name';

/**
 * 홈 화면 분석용 화면 이름 (screen_view · 이벤트 screen_name 공통).
 * 홈은 한 라우트(/home) 안에서 기간(연도/월)과 뷰(캘린더/리스트)가 갈리므로
 * 라우트 경로 대신 아래 이름을 쓴다.
 *
 * 홈
 * ├─ 연도            → /home-year
 * └─ 월
 *    ├─ 캘린더뷰     → /home-month-calendar
 *    └─ 리스트뷰     → /home-month-list
 */
export const HOME_YEAR_SCREEN_NAME = '/home-year';
export const HOME_MONTH_CALENDAR_SCREEN_NAME = '/home-month-calendar';
export const HOME_MONTH_LIST_SCREEN_NAME = '/home-month-list';

export type HomeViewType = 'calendar' | 'list';

const HOME_PATHNAME = '/home';
const REPORT_PATHNAME = '/report';

/** 홈이 지금 보여 주는 뷰의 화면 이름. 홈 밖의 전역 UI가 이벤트를 남길 때 쓴다 */
let currentHomeScreenName: string | null = null;

export function setCurrentHomeScreenName(screenName: string): void {
  currentHomeScreenName = screenName;
}

/**
 * 어느 화면에서나 뜨는 UI(기록/챌린지 시트, 기록 수신 안내 카드)의 `screen_name`.
 * 홈·리포트면 지금 보고 있는 뷰(서브 탭)의 이름, 그 외에는 경로 그대로.
 */
export function resolveAnalyticsScreenName(pathname: string): string {
  if (pathname === HOME_PATHNAME) {
    return currentHomeScreenName ?? pathname;
  }
  if (pathname === REPORT_PATHNAME) {
    return getCurrentReportScreenName() ?? pathname;
  }
  return pathname;
}

export function getHomeScreenName(viewType: HomeViewType, periodType: 'year' | 'month'): string {
  if (periodType === 'year') {
    return HOME_YEAR_SCREEN_NAME;
  }
  return viewType === 'list' ? HOME_MONTH_LIST_SCREEN_NAME : HOME_MONTH_CALENDAR_SCREEN_NAME;
}
