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

export function getHomeScreenName(viewType: HomeViewType, periodType: 'year' | 'month'): string {
  if (periodType === 'year') {
    return HOME_YEAR_SCREEN_NAME;
  }
  return viewType === 'list' ? HOME_MONTH_LIST_SCREEN_NAME : HOME_MONTH_CALENDAR_SCREEN_NAME;
}
