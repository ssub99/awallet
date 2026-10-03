/**
 * 알림 수신 대상 선택 — Android 전용
 * Figma / Fluid: settings.smsReceive.appNotificationTargetSelect
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { UiLineText } from '@/components/ui/ui-line-text';
import { atomicColors } from '@/constants/atomic-colors';
import { themeColors } from '@/constants/theme-colors';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadAndroidLauncherApps } from '@/utils/android-record-inbox-notification-access';
import {
  type AppNotificationReceiveTarget,
  loadAppNotificationReceiveTargets,
  saveAppNotificationReceiveTargets,
} from '@/utils/record-inbox-receive-settings';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsRecordInboxAppTargetsScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setLoading } = useLoading();
  const { showToast } = useToast();
  const [apps, setApps] = useState<AppNotificationReceiveTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [launcherApps, targets] = await Promise.all([
          loadAndroidLauncherApps(),
          loadAppNotificationReceiveTargets(),
        ]);
        if (cancelled) return;
        setApps(launcherApps);
        setSelected(new Set(targets.map((target) => target.packageName)));
      } catch {
        if (!cancelled) showToast('설치된 앱 목록을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [setLoading, showToast]);

  const toggleApp = useCallback((packageName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(packageName)) {
        next.delete(packageName);
      } else {
        next.add(packageName);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    await saveAppNotificationReceiveTargets(apps.filter((app) => selected.has(app.packageName)));
    router.back();
  }, [apps, router, selected]);

  return (
    <View style={[styles.container, { backgroundColor: colors.staticWhite, paddingTop: insets.top }]}>
      <TopNavigation
        type="sub"
        title="알림 수신 대상"
        showLeftIcon
        onLeftIconPress={() => router.back()}
        showRightButton
        rightButtonText="확인"
        onRightButtonPress={() => void handleConfirm()}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.fill }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 16 + insets.bottom }]}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        {apps.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
            {apps.map((app, index) => {
              const isSelected = selected.has(app.packageName);
              return (
                <View key={app.packageName}>
                  <Pressable
                    style={styles.appRow}
                    onPress={() => toggleApp(app.packageName)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={app.label}
                  >
                    <View style={styles.appLeading}>
                      <View style={styles.appLogo}>
                        {app.icon ? (
                          <Image source={{ uri: app.icon }} style={styles.appLogoImage} />
                        ) : null}
                      </View>
                      <UiLineText style={{ color: colors.text }} numberOfLines={1}>
                        {app.label}
                      </UiLineText>
                    </View>
                    {isSelected ? (
                      <Icon name="check" variant="line" size={24} color={colors.primary} />
                    ) : null}
                  </Pressable>
                  {index < apps.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  /** Figma Frame 65 · 56 · pad 12/16 */
  appRow: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  /** Figma Frame 53 · 로고 32 + gap 8 + 앱 이름 */
  appLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** Figma Frame 316 · 32 · radius 10 · Atomic/Neutral/200 stroke */
  appLogo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: atomicColors.neutral[200],
    overflow: 'hidden',
  },
  appLogoImage: {
    width: '100%',
    height: '100%',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
});
