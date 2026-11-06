import { Platform } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

/**
 * NativeTabs 플로팅 탭바 ↔ 홈 absolute 간편입력 SSOT.
 *
 * 레이아웃 모델 (iOS Liquid Glass):
 * - 본문은 탭바 아래로 연장 (home SafeAreaView edges top only)
 * - 탭 글래스 상단 ≈ content + home indicator (실측 ~74pt @ safe≈34 → content≈40–49)
 * - 간편입력 = 탭 위 플로팅 오버레이 (레이아웃 행이 아님)
 * - 캘린더 paddingBottom = 간편입력 `bottom` 과 동일 — 숏 높이를 행으로 빼지 않음
 *   (그리드가 숏 뒤로 연장되고, 숏이 그 위를 덮음)
 *
 * Android: 시스템 bottom inset이 탭바를 비킴 → gap만 예약 (숏은 동일하게 오버레이).
 */

/** 홈 인디케이터 위 탭 콘텐츠 밴드 (플로팅 글래스). 70은 과다 — 캘린더 압축·QI 부상 원인. */
export const TAB_BAR_CONTENT_HEIGHT = Platform.OS === 'ios' ? 49 : 56;

export const QUICK_INPUT_GAP_ABOVE_TAB_BAR = 16;

/** @deprecated 이름 호환 */
export const FAB_GAP_ABOVE_TAB_BAR = QUICK_INPUT_GAP_ABOVE_TAB_BAR;

/** 간편입력 숏 높이 (오버레이 크기 참고용 — 본문 inset에 더하지 않음) */
export const HOME_BOTTOM_OVERLAY_HEIGHT = 48;

function effectiveSafeAreaBottom(safeAreaBottom: number): number {
  if (safeAreaBottom > 0) return safeAreaBottom;
  return initialWindowMetrics?.insets.bottom ?? 0;
}

/**
 * 화면 하단 → 탭 글래스 상단.
 * insets.bottom 이 이미 탭 크롬을 포함하면(드물게) 이중 합산하지 않는다.
 */
export function getTabBarBottomClearance(safeAreaBottom: number): number {
  const safe = effectiveSafeAreaBottom(safeAreaBottom);
  if (Platform.OS === 'ios' && safe >= TAB_BAR_CONTENT_HEIGHT + 20) {
    return safe;
  }
  return TAB_BAR_CONTENT_HEIGHT + safe;
}

/**
 * @deprecated 숏 높이를 본문에서 빼던 옛 모델.
 * 간편입력은 플로팅이므로 getQuickInputBottomAboveTabBar / getHomeBottomContentInset 사용.
 */
export function getOverlayOnlyBottomInset(
  _overlayHeight: number = HOME_BOTTOM_OVERLAY_HEIGHT,
): number {
  return QUICK_INPUT_GAP_ABOVE_TAB_BAR;
}

/** absolute 간편입력 `bottom` — 탭 글래스 위 gap */
export function getQuickInputBottomAboveTabBar(safeAreaBottom: number): number {
  if (Platform.OS === 'android') {
    return QUICK_INPUT_GAP_ABOVE_TAB_BAR;
  }
  return getTabBarBottomClearance(safeAreaBottom) + QUICK_INPUT_GAP_ABOVE_TAB_BAR;
}

/** @deprecated 이름 호환 */
export function getFabBottomAboveTabBar(safeAreaBottom: number): number {
  return getQuickInputBottomAboveTabBar(safeAreaBottom);
}

/**
 * 홈 월/년 뷰 paddingBottom.
 * 간편입력 숏 높이(행)는 넣지 않는다 — 숏은 캘린더 위 플로팅.
 */
export function getHomeBottomContentInset(safeAreaBottom: number): number {
  return getQuickInputBottomAboveTabBar(safeAreaBottom);
}

export function getTabScreenScrollPaddingBottom(
  safeAreaBottom: number,
  extra: number = 16,
): number {
  if (Platform.OS === 'android') {
    return Math.max(0, extra);
  }
  return getTabBarBottomClearance(safeAreaBottom) + Math.max(0, extra);
}

export function assertTabBarMetricsConsistent(): void {
  if (!__DEV__) return;
  const safe = 34;
  if (getHomeBottomContentInset(safe) !== getQuickInputBottomAboveTabBar(safe)) {
    console.error('[tab-bar-metrics] home inset must match QI bottom (no overlay row)');
  }
  if (Platform.OS === 'ios') {
    const clearance = getTabBarBottomClearance(safe);
    // 실측 글래스 상단 ~74, content 49+34=83 — 허용 대역
    if (clearance < 60 || clearance > 100) {
      console.warn('[tab-bar-metrics] iOS clearance out of expected band', clearance);
    }
  }
}
