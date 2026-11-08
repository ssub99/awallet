/**
 * Native system tab bar (iOS Liquid Glass on 26+, classic UITabBar below;
 * Android Material Navigation bar) with brand icons from xcasset / drawable.
 *
 * Figma tabBar 순서: 홈 · 챌린지 · 리포트 · 설정
 *
 * 색·타이포 계약 (구현은 NativeTabs):
 * - 아이콘: 활성/비활성 모두 staticBlack — 상태는 line ↔ solid 로만 구분
 * - 라벨: 활성/비활성 모두 text — 상태는 detail.bold ↔ detail.regular 로만 구분
 * - Android: 배경 staticWhite, 라벨은 labelVisibilityMode=`labeled`로 항상 표시
 *   (기본 `auto`/`selected`면 비활성 탭 라벨이 숨겨짐), 활성 인디케이터는 disableIndicator
 * - Android 상단 1px 라인: NativeTabs에 border API가 없어 커스텀 TabBar와 동일하게
 *   `palette.border` 오버레이 (탭바 교체 아님)
 *
 * 기록하기는 FAB(홈·챌린지) → createSheetEvent. 탭바 슬롯 없음.
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
 * (백그라운드)으로 넘긴다.
 */

import { isExpoGo } from '@/constants/api';
import {
  EXPO_GO_TAB_SYSTEM_ICONS,
  MAIN_TAB_SPECS,
  type MainTabName,
} from '@/constants/navigation/tab-spec';
import { assertTabBarMetricsConsistent } from '@/constants/navigation/tab-bar-metrics';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setLastMainTab, type LastMainTabName } from '@/utils/last-main-tab';
import { tabReselectEvent, type TabReselectName } from '@/utils/tab-reselect-event';
import type { AndroidSymbol } from 'expo-symbols';
import { NativeTabs } from 'expo-router/native-tabs';
import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
  return name === 'home' || name === 'challenge' || name === 'report';
}

function isContentTab(name: MainTabName): name is LastMainTabName {
  return (
    name === 'home' || name === 'challenge' || name === 'report' || name === 'mypage'
  );
}

/**
 * Material3 BottomNavigation `labeled` 콘텐츠 높이.
 * `TAB_BAR_CONTENT_HEIGHT`(56)는 아이콘 밴드 기준이라, 라벨 상시 표시 시
 * 상단 디바이더가 바 중간에 붙는 원인이 됨.
 */
const ANDROID_LABELED_NATIVE_TAB_BAR_HEIGHT = 80;

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

          return (
            <NativeTabs.Trigger
              key={tab.name}
              name={tab.name}
              disablePopToTop={handlesReselect}
              disableScrollToTop={handlesReselect}
              disableAutomaticContentInsets={Platform.OS === 'ios'}
              accessibilityLabel={tab.label}
              listeners={{
                focus: () => {
                  focusedTabRef.current = tab.name;
                  if (isContentTab(tab.name)) {
                    setLastMainTab(tab.name);
                  }
                },
                tabPress: () => {
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
});
