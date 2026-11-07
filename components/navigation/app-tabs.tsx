/**
 * Native system tab bar (iOS Liquid Glass on 26+, classic UITabBar below;
 * Android Material Navigation bar) with brand icons from xcasset / drawable.
 *
 * Figma tabBar 순서: 홈 · 챌린지∙통계 · 기록하기 · 설정
 *
 * 색·타이포 계약 (구현은 NativeTabs):
 * - 아이콘: 활성/비활성 모두 staticBlack — 상태는 line ↔ solid 로만 구분
 * - 라벨: 활성/비활성 모두 text — 상태는 detail.bold ↔ detail.regular 로만 구분
 * - Android: 배경 staticWhite, 라벨은 labelVisibilityMode=`labeled`로 항상 표시
 *   (기본 `auto`/`selected`면 비활성 탭 라벨이 숨겨짐), 활성 인디케이터는 disableIndicator
 * - Android 상단 1px 라인: NativeTabs에 border API가 없어 커스텀 TabBar와 동일하게
 *   `palette.border` 오버레이 (탭바 교체 아님)
 *
 * 기록하기: 네이티브 탭 `disabled`(preventNativeSelection)만으로는 Liquid Glass가
 * 선택 인디케이터를 한 번 움직였다 되돌리는 것처럼 보인다.
 * → 기록하기 슬롯 위에 JS hit target을 올려 네이티브 터치를 가로채고 시트만 연다.
 * → 다른 탭에서 스크럽해 기록하기에서 손을 뗄 때 네이티브가 tabPress를내도
 *    시트는 열지 않는다(시작 탭으로 복귀만). 실제 탭은 hit target onPress만.
 *
 * 간편입력은 홈 화면 absolute + GlassSurface (BottomAccessory 미사용).
 *
 * iOS: 캘린더 horizontal ScrollView가 첫 ScrollView라 disableAutomaticContentInsets 유지.
 * Android: 시스템 bottom inset으로 탭바 회피.
 *
 * 공지 미읽: 탭바 뱃지 없음 (NativeTabs가 6×6 커스텀 도트를 제공하지 않음).
 * 설정 본문 공지사항 행 뱃지만 유지.
 *
 * Android OS 뒤로가기: 탭 스택은 각 탭 첫 화면까지 pop. 탭 루트에서는
 * `backBehavior="none"`으로 홈(initialRoute) 점프를 막고, Activity 기본
 * (백그라운드)으로 넘긴다. 설정 탭에서 `/home`으로 navigate 하던 핸들러는 제거.
 */

import { isExpoGo } from '@/constants/api';
import {
  EXPO_GO_TAB_SYSTEM_ICONS,
  MAIN_TAB_SPECS,
  type MainTabName,
} from '@/constants/navigation/tab-spec';
import {
  TAB_BAR_CONTENT_HEIGHT,
  assertTabBarMetricsConsistent,
} from '@/constants/navigation/tab-bar-metrics';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { setLastMainTab, type LastMainTabName } from '@/utils/last-main-tab';
import { tabReselectEvent, type TabReselectName } from '@/utils/tab-reselect-event';
import type { AndroidSymbol } from 'expo-symbols';
import { NativeTabs } from 'expo-router/native-tabs';
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * NativeTabs 라벨: 색·size·weight만 전달 (Pretendard family는 UITabBar에서 무시/실패하기 쉬움).
 * titleTextAttributes가 탭바에 붙도록 RNS 패치 필요 — patches/react-native-screens+4.30.1.patch
 * (네이티브 재빌드 필수)
 */
function nativeTabLabelStyle(
  color: string,
  textStyle: Pick<typeof typography.detail.regular, 'fontSize' | 'fontWeight'>,
) {
  return {
    color,
    fontSize: textStyle.fontSize,
    fontWeight: textStyle.fontWeight,
  } as const;
}

function isReselectTab(name: MainTabName): name is TabReselectName {
  return name === 'home' || name === 'challenge';
}

function isContentTab(name: MainTabName): name is LastMainTabName {
  return name === 'home' || name === 'challenge' || name === 'mypage';
}

const CREATE_TAB_INDEX = MAIN_TAB_SPECS.findIndex((tab) => tab.name === 'create');

/**
 * Material3 BottomNavigation `labeled` 콘텐츠 높이.
 * `TAB_BAR_CONTENT_HEIGHT`(56)는 아이콘 밴드 기준이라, 라벨 상시 표시 시
 * 상단 디바이더가 바 중간에 붙는 원인이 됨.
 */
const ANDROID_LABELED_NATIVE_TAB_BAR_HEIGHT = 80;

function CreateTabHitTarget() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tabCount = MAIN_TAB_SPECS.length;
  const slotWidth = windowWidth / tabCount;
  const left = slotWidth * Math.max(0, CREATE_TAB_INDEX);
  const height = TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 12) + 12;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="기록하기"
      onPress={() => {
        createSheetEvent.emit();
      }}
      style={[
        styles.createHitTarget,
        {
          left,
          width: slotWidth,
          height,
          bottom: 0,
        },
      ]}
    />
  );
}

/** 커스텀 TabBar `styles.divider`와 동일 — NativeTabs border API 대체 */
function NativeTabBarTopDivider({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  // 네이티브 바 전체 높이(콘텐츠 + 시스템 inset)의 상단 가장자리
  const bottom = Math.max(
    0,
    ANDROID_LABELED_NATIVE_TAB_BAR_HEIGHT + insets.bottom - 1,
  );

  return (
    <View
      pointerEvents="none"
      style={[
        styles.topDivider,
        {
          backgroundColor: color,
          bottom,
        },
      ]}
    />
  );
}

export function AppTabs() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const focusedTabRef = useRef<MainTabName>('home');
  const inExpoGo = isExpoGo();

  const labelStyleDefault = nativeTabLabelStyle(palette.text, typography.detail.regular);
  const labelStyleSelected = nativeTabLabelStyle(palette.text, typography.detail.bold);

  if (__DEV__) {
    assertTabBarMetricsConsistent();
  }

  return (
    <View style={styles.root}>
      <NativeTabs
        minimizeBehavior="automatic"
        /** Android: 기본 `initialRoute`면 챌린지/설정 루트에서 뒤로가기 시 홈으로 점프 */
        backBehavior="none"
        tintColor={palette.text}
        backgroundColor={palette.staticWhite}
        labelVisibilityMode="labeled"
        disableIndicator
        rippleColor="transparent"
        iconColor={{
          default: palette.staticBlack,
          selected: palette.staticBlack,
        }}
        labelStyle={{
          default: labelStyleDefault,
          selected: labelStyleSelected,
        }}
        disableTransparentOnScrollEdge
      >
        {MAIN_TAB_SPECS.map((tab) => {
          const handlesReselect = isReselectTab(tab.name);
          const isActionOnly = Boolean(tab.actionOnly);

          return (
            <NativeTabs.Trigger
              key={tab.name}
              name={tab.name}
              disabled={isActionOnly}
              disablePopToTop={handlesReselect || isActionOnly}
              disableScrollToTop={handlesReselect || isActionOnly}
              disableAutomaticContentInsets={Platform.OS === 'ios'}
              accessibilityLabel={isActionOnly ? undefined : tab.label}
              listeners={{
                focus: () => {
                  if (isActionOnly) {
                    return;
                  }
                  focusedTabRef.current = tab.name;
                  if (isContentTab(tab.name)) {
                    setLastMainTab(tab.name);
                  }
                },
                tabPress: () => {
                  if (isActionOnly) {
                    return;
                  }
                  if (!isReselectTab(tab.name)) {
                    return;
                  }
                  if (focusedTabRef.current !== tab.name) {
                    return;
                  }
                  tabReselectEvent.emit(tab.name);
                },
              }}
            >
              <NativeTabs.Trigger.Label selectedStyle={labelStyleSelected}>
                {tab.label}
              </NativeTabs.Trigger.Label>
              {inExpoGo ? (
                <NativeTabs.Trigger.Icon
                  sf={{
                    default: EXPO_GO_TAB_SYSTEM_ICONS[tab.name].sf.default as SFSymbol,
                    selected: EXPO_GO_TAB_SYSTEM_ICONS[tab.name].sf.selected as SFSymbol,
                  }}
                  md={{
                    default: EXPO_GO_TAB_SYSTEM_ICONS[tab.name].md.default as AndroidSymbol,
                    selected: EXPO_GO_TAB_SYSTEM_ICONS[tab.name].md.selected as AndroidSymbol,
                  }}
                />
              ) : (
                <NativeTabs.Trigger.Icon
                  xcasset={{
                    default: tab.icons.default,
                    selected: tab.icons.selected,
                  }}
                  drawable={{
                    default: tab.icons.default,
                    selected: tab.icons.selected,
                  }}
                />
              )}
            </NativeTabs.Trigger>
          );
        })}
      </NativeTabs>
      {Platform.OS === 'android' ? (
        <NativeTabBarTopDivider color={palette.border} />
      ) : null}
      {CREATE_TAB_INDEX >= 0 ? <CreateTabHitTarget /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    zIndex: 99,
  },
  createHitTarget: {
    position: 'absolute',
    zIndex: 100,
    backgroundColor: 'transparent',
  },
});
