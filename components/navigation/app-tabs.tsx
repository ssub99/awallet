/**
 * Native system tab bar (iOS Liquid Glass on 26+, classic UITabBar below;
 * Android Material Navigation bar) with brand icons from xcasset / drawable.
 */

import { MAIN_TAB_SPECS, type MainTabName } from '@/constants/navigation/tab-spec';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNoticeUnreadCount } from '@/hooks/use-notice-unread-count';
import { tabReselectEvent, type TabReselectName } from '@/utils/tab-reselect-event';
import { NativeTabs } from 'expo-router/native-tabs';
import { useRef } from 'react';

function isReselectTab(name: MainTabName): name is TabReselectName {
  return name === 'home' || name === 'challenge';
}

export function AppTabs() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const hasUnreadNotice = useNoticeUnreadCount() > 0;
  const focusedTabRef = useRef<MainTabName>('home');

  return (
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
        return (
          <NativeTabs.Trigger
            key={tab.name}
            name={tab.name}
            disablePopToTop={handlesReselect}
            disableScrollToTop={handlesReselect}
            accessibilityLabel={
              tab.noticeBadge && hasUnreadNotice ? `${tab.label}, 새 공지 있음` : tab.label
            }
            listeners={{
              focus: () => {
                focusedTabRef.current = tab.name;
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
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
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
            {showBadge ? <NativeTabs.Trigger.Badge> </NativeTabs.Trigger.Badge> : null}
          </NativeTabs.Trigger>
        );
      })}
    </NativeTabs>
  );
}
