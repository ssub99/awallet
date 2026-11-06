/**
 * Native system tab bar (iOS Liquid Glass on 26+, classic UITabBar below;
 * Android Material Navigation bar) with brand icons from xcasset / drawable.
 *
 * Figma tabBar 순서: 홈 · 챌린지∙통계 · 기록하기 · 설정
 *
 * 기록하기: 네이티브 탭 `disabled`(preventNativeSelection)만으로는 Liquid Glass가
 * 선택 인디케이터를 한 번 움직였다 되돌리는 것처럼 보인다.
 * → 기록하기 슬롯 위에 JS hit target을 올려 네이티브 터치를 가로채고 시트만 연다.
 *
 * 간편입력은 홈 화면 absolute + GlassSurface (BottomAccessory 미사용).
 *
 * iOS: 캘린더 horizontal ScrollView가 첫 ScrollView라 disableAutomaticContentInsets 유지.
 * Android: 시스템 bottom inset으로 탭바 회피.
 */

import { MAIN_TAB_SPECS, type MainTabName } from '@/constants/navigation/tab-spec';
import { atomicColors } from '@/constants/atomic-colors';
import {
  TAB_BAR_CONTENT_HEIGHT,
  assertTabBarMetricsConsistent,
} from '@/constants/navigation/tab-bar-metrics';
import { colors, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNoticeUnreadCount } from '@/hooks/use-notice-unread-count';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { setLastMainTab, type LastMainTabName } from '@/utils/last-main-tab';
import { tabReselectEvent, type TabReselectName } from '@/utils/tab-reselect-event';
import { NativeTabs } from 'expo-router/native-tabs';
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function isReselectTab(name: MainTabName): name is TabReselectName {
  return name === 'home' || name === 'challenge';
}

function isContentTab(name: MainTabName): name is LastMainTabName {
  return name === 'home' || name === 'challenge' || name === 'mypage';
}

const CREATE_TAB_INDEX = MAIN_TAB_SPECS.findIndex((tab) => tab.name === 'create');

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

export function AppTabs() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const hasUnreadNotice = useNoticeUnreadCount() > 0;
  const focusedTabRef = useRef<MainTabName>('home');

  if (__DEV__) {
    assertTabBarMetricsConsistent();
  }

  return (
    <View style={styles.root}>
      <NativeTabs
        minimizeBehavior="automatic"
        tintColor={palette.staticBlack}
        iconColor={{
          default: palette.textAssistive,
          selected: palette.staticBlack,
        }}
        labelStyle={{
          default: { color: palette.textAssistive },
          selected: { color: palette.staticBlack },
        }}
        badgeBackgroundColor={atomicColors.red[600]}
        disableTransparentOnScrollEdge
      >
        {MAIN_TAB_SPECS.map((tab) => {
          const showBadge = Boolean(tab.noticeBadge && hasUnreadNotice);
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
              accessibilityLabel={
                isActionOnly
                  ? undefined
                  : tab.noticeBadge && hasUnreadNotice
                    ? `${tab.label}, 새 공지 있음`
                    : tab.label
              }
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
                    createSheetEvent.emit();
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
              <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
              {isActionOnly ? (
                <NativeTabs.Trigger.Icon
                  sf="plus.circle"
                  xcasset={{
                    default: tab.icons.default,
                    selected: tab.icons.selected,
                  }}
                  drawable={{
                    default: tab.icons.default,
                    selected: tab.icons.selected,
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
              {showBadge ? <NativeTabs.Trigger.Badge> </NativeTabs.Trigger.Badge> : null}
            </NativeTabs.Trigger>
          );
        })}
      </NativeTabs>
      {CREATE_TAB_INDEX >= 0 ? <CreateTabHitTarget /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  createHitTarget: {
    position: 'absolute',
    zIndex: 100,
    backgroundColor: 'transparent',
  },
});
