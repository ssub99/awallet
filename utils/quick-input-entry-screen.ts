import type { SimpleCreationEntryScreen } from '@/utils/analytics';

/**
 * 이번 간편입력을 연 시점의 홈 뷰. 간편입력 이벤트의 `entry_screen` 속성 값이다.
 *
 * 간편입력은 캘린더뷰·리스트뷰가 같은 화면 이름(/quick-input, /record-inbox)을 쓰므로,
 * 뷰별 비교는 이 속성으로만 가능하다. 열 때 한 번 정해 두면 컨텍스트·입력창·수신함 카드 등
 * 어디서 찍는 이벤트든 같은 값을 쓰고, 생성 도중 화면을 오가도 값이 바뀌지 않는다.
 */
let currentEntryScreen: SimpleCreationEntryScreen = 'home_month_calendar';

export function setQuickInputEntryScreen(entryScreen: SimpleCreationEntryScreen): void {
  currentEntryScreen = entryScreen;
}

export function getQuickInputEntryScreen(): SimpleCreationEntryScreen {
  return currentEntryScreen;
}
