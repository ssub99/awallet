/**
 * Components Demo Page
 * 
 * Main components showcase page with tab navigation.
 * Demonstrates all UI components in a single organized view.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CalendarDaySelect } from '@/components/ui/calendar-day-select';
import { CalendarMain } from '@/components/ui/calendar-main';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Radio } from '@/components/ui/radio';
import { RadioGroup } from '@/components/ui/radio-group';
import { Selectbox } from '@/components/ui/selectbox';
import { Switch } from '@/components/ui/switch';
import { Tab } from '@/components/ui/tab';
import { Tag } from '@/components/ui/tag';
import { colors, typography, type ColorPalette, typographyLayout } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  checkActiveChallengesNotifications,
  checkEndedChallenges,
  emitEndedChallengeResultAnalytics,
  getChallengeStatus,
  getProgressMilestoneForPercentage,
  parseProgressNotificationMilestone,
} from '@/utils/challenge-utils';
import { getAllChallenges } from '@/utils/challenges';
import {
    cancelAllNotifications,
    cancelDailyReminder,
    clearChallengeNotificationMarks,
    getChallengeNotificationsEnabled,
    getDailyReminderDebugSnapshot,
    getGeneralNotificationsEnabled,
    getScheduledNotifications,
    sendTestNotification,
    setupDailyReminder,
} from '@/utils/notification-scheduler';
import { storageCache } from '@/utils/storage-cache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as ExpoNotifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { getExpoNotifications } from '@/utils/expo-notifications-client';
import { useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ComponentTab = 'test' | 'buttons' | 'inputs' | 'selectboxs' | 'radios' | 'checkboxes' | 'switches' | 'modals' | 'bottomsheets' | 'tags' | 'calendars' | 'tabs' | 'topnav';

function getRecordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function getNotificationDataString(data: unknown, key: string, fallback: string): string {
  const value = getRecordValue(data, key);
  return typeof value === 'string' ? value : fallback;
}

function getNotificationDataNumber(data: unknown, key: string, fallback = 0): number {
  const value = getRecordValue(data, key);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return fallback;
}

function getRecordNumber(value: unknown, key: string): number | null {
  const recordValue = getRecordValue(value, key);
  if (typeof recordValue === 'number' && Number.isFinite(recordValue)) return recordValue;
  if (typeof recordValue === 'string') {
    const numericValue = Number(recordValue);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return null;
}

function toSchedulableTriggerInput(
  trigger: unknown
): ExpoNotifications.SchedulableNotificationTriggerInput | null {
  const SchedulableTriggerInputTypes = getExpoNotifications()?.SchedulableTriggerInputTypes;
  if (!SchedulableTriggerInputTypes) {
    return null;
  }
  if (!trigger || typeof trigger !== 'object') return null;

  const triggerType = getTriggerType(trigger);
  if (triggerType === 'timeInterval') {
    const seconds = getRecordNumber(trigger, 'seconds');
    if (seconds === null) return null;
    return {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: getRecordValue(trigger, 'repeats') === true,
    };
  }

  if (triggerType === 'calendar') {
    const dateComponents = getRecordValue(trigger, 'dateComponents');
    if (!dateComponents || typeof dateComponents !== 'object') return null;

    const calendarTrigger: ExpoNotifications.CalendarTriggerInput = {
      type: SchedulableTriggerInputTypes.CALENDAR,
      repeats: getRecordValue(trigger, 'repeats') === true,
    };
    const componentKeys = [
      'year',
      'month',
      'day',
      'hour',
      'minute',
      'second',
      'weekday',
      'weekdayOrdinal',
    ] as const;

    for (const key of componentKeys) {
      const value = getRecordNumber(dateComponents, key);
      if (value !== null) {
        calendarTrigger[key] = value;
      }
    }

    return calendarTrigger;
  }

  if (triggerType === 'daily') {
    const hour = getRecordNumber(trigger, 'hour');
    const minute = getRecordNumber(trigger, 'minute');
    if (hour === null || minute === null) return null;
    return { type: SchedulableTriggerInputTypes.DAILY, hour, minute };
  }

  const timestamp = getRecordValue(trigger, 'timestamp');
  if (triggerType === 'date' && (typeof timestamp === 'number' || typeof timestamp === 'string')) {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      return { type: SchedulableTriggerInputTypes.DATE, date };
    }
  }

  return null;
}

async function formatTriggerDateLabel(trigger: unknown): Promise<string> {
  const syncDate = getTriggerDate(trigger);
  if (syncDate) return syncDate.toLocaleString('ko-KR');

  const dailyTriggerText = getDailyTriggerText(trigger);
  if (dailyTriggerText) return dailyTriggerText;

  const triggerInput = toSchedulableTriggerInput(trigger);
  const Notifications = getExpoNotifications();
  if (triggerInput && Notifications) {
    try {
      const nextTriggerMs = await Notifications.getNextTriggerDateAsync(triggerInput);
      if (nextTriggerMs != null) {
        return new Date(nextTriggerMs).toLocaleString('ko-KR');
      }
    } catch {
      // dev 표시용 — 실패 시 아래 fallback 사용
    }
  }

  return '발송일 없음';
}

function getTriggerDate(trigger: unknown): Date | null {
  const value = getRecordValue(trigger, 'date') ?? getRecordValue(trigger, 'timestamp');
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateComponents = getRecordValue(trigger, 'dateComponents');
  const year = getRecordNumber(dateComponents, 'year');
  const month = getRecordNumber(dateComponents, 'month');
  const day = getRecordNumber(dateComponents, 'day');
  if (year === null || month === null || day === null) return null;

  const hour = getRecordNumber(dateComponents, 'hour') ?? 0;
  const minute = getRecordNumber(dateComponents, 'minute') ?? 0;
  const second = getRecordNumber(dateComponents, 'second') ?? 0;
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDailyTriggerText(trigger: unknown): string | null {
  const hour = getRecordValue(trigger, 'hour');
  const minute = getRecordValue(trigger, 'minute');
  if (typeof hour !== 'number' || typeof minute !== 'number') return null;

  return `매일 ${hour}시 ${minute}분`;
}

function getTriggerType(trigger: unknown): string {
  const type = getRecordValue(trigger, 'type');
  return typeof type === 'string' ? type : '알 수 없음';
}

export default function ComponentsScreen() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ComponentTab>('test');

  const tabs = [
    { label: 'Test', value: 'test' as ComponentTab },
    { label: 'Buttons', value: 'buttons' as ComponentTab },
    { label: 'Inputs', value: 'inputs' as ComponentTab },
    { label: 'Selectboxs', value: 'selectboxs' as ComponentTab },
    { label: 'Radios', value: 'radios' as ComponentTab },
    { label: 'Checkboxes', value: 'checkboxes' as ComponentTab },
    { label: 'Switches', value: 'switches' as ComponentTab },
    { label: 'Modals', value: 'modals' as ComponentTab },
    { label: 'Bottomsheets', value: 'bottomsheets' as ComponentTab },
    { label: 'Tags', value: 'tags' as ComponentTab },
    { label: 'Calendars', value: 'calendars' as ComponentTab },
    { label: 'Tabs', value: 'tabs' as ComponentTab },
    { label: 'TopNav', value: 'topnav' as ComponentTab },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#fff' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={[styles.innerContainer, { backgroundColor: palette.background }]}>
        {/* Top Navigation */}
        <TopNavigation
          type="sub"
          title="테스트 환경"
          showLeftIcon
          onLeftIconPress={() => {

            router.back();
          }}
        />

        {/* Tab Navigation */}
        <View style={styles.tabWrapper}>
          <Tab
            options={tabs}
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ComponentTab)}
            scrollable
          />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {activeTab === 'test' && <TestContent colors={palette} />}
          {activeTab === 'buttons' && <ButtonsContent colors={palette} />}
          {activeTab === 'inputs' && <InputsContent colors={palette} />}
          {activeTab === 'selectboxs' && <SelectboxsContent colors={palette} />}
          {activeTab === 'radios' && <RadiosContent colors={palette} />}
          {activeTab === 'checkboxes' && <CheckboxesContent colors={palette} />}
          {activeTab === 'switches' && <SwitchesContent colors={palette} />}
          {activeTab === 'modals' && <ModalsContent colors={palette} />}
          {activeTab === 'bottomsheets' && <BottomsheetsContent colors={palette} />}
          {activeTab === 'tags' && <TagsContent colors={palette} />}
          {activeTab === 'calendars' && <CalendarsContent colors={palette} />}
          {activeTab === 'tabs' && <TabsContent colors={palette} />}
          {activeTab === 'topnav' && <TopNavContent colors={palette} />}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/**
 * Test Content
 */
function TestContent({ colors }: { colors: ColorPalette }) {
  const [devMode, setDevMode] = useState(false);
  const { refresh } = useAppData();

  // 원본 Date 생성자 저장
  const OriginalDate = Date;
  
  // 실제 현재 날짜
  const realCurrentDate = {
    getFullYear: () => 2025,
    getMonth: () => 9, // 10월 (0부터 시작)
    getDate: () => 22,
    getTime: () => new OriginalDate(2025, 9, 22).getTime()
  };

  // 테스트용 날짜 설정 함수
  const setTestDate = (year: number, month: number, day: number) => {
    if (__DEV__) {

      const testDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      console.log('🧪 [테스트] 날짜 설정:', testDate.toISOString().split('T')[0]);
      
      // Date.now() 오버라이드
      const originalNow = Date.now;
      Date.now = () => testDate.getTime();
      
      // new Date() 오버라이드
      const OriginalDate = Date;
      (Date as any) = class extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(testDate);
          } else {
            // @ts-ignore
            super(...args);
          }
        }
      };
      
      // 전역에 복원 함수 저장
      (window as any).restoreDate = () => {
        Date.now = originalNow;
        (Date as any) = OriginalDate;

      };
    }
  };

  // 날짜 복원 함수
  const restoreDate = () => {
    if ((window as any).restoreDate) {
      (window as any).restoreDate();
    }
  };

  const isGeneralNotification = (notification: { identifier: string; content: { data?: Record<string, unknown> } }) => {
    const type = notification.content.data?.type;
    return notification.identifier === 'daily_expense_reminder' || type === 'expense_reminder';
  };

  const isChallengeNotification = (notification: { content: { data?: Record<string, unknown> } }) => {
    const type = notification.content.data?.type;
    return (
      type === 'challenge_progress' ||
      type === 'challenge_success' ||
      type === 'challenge_failure'
    );
  };

  return (
    <>
      <SectionHeader title="🧪 개발자 도구" colors={colors} />
      
      {/* Developer Mode Section - Wrapped in gray box */}
      <View style={[styles.devModeContainer, { backgroundColor: colors.fill }]}>
        {/* Developer Mode Toggle */}
        <View style={styles.devModeSwitchRow}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>
            개발자 모드
          </Text>
          <Switch value={devMode} onValueChange={setDevMode} />
        </View>
      </View>

      {/* Date Adjustment (if dev mode enabled) */}
      {devMode && (
        <>
          <SectionHeader title="📅 날짜 조정" colors={colors} />
          
          <View style={styles.section}>
            {/* 첫 번째 행 */}
            <View style={styles.dateButtonRow}>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  const year = realCurrentDate.getFullYear();
                  const month = realCurrentDate.getMonth() + 1;
                  const day = realCurrentDate.getDate();
                  setTestDate(year, month, day);
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>현재</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>
                  {realCurrentDate.getFullYear()}.{String(realCurrentDate.getMonth() + 1).padStart(2, '0')}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 2, realCurrentDate.getDate());
                  setTestDate(futureDate.getFullYear(), futureDate.getMonth() + 1, futureDate.getDate());
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>2개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>
                  {(() => {
                    const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 2, realCurrentDate.getDate());
                    return `${futureDate.getFullYear()}.${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
                  })()}
                </Text>
              </Pressable>
            </View>

            {/* 두 번째 행 */}
            <View style={styles.dateButtonRow}>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 5, realCurrentDate.getDate());
                  setTestDate(futureDate.getFullYear(), futureDate.getMonth() + 1, futureDate.getDate());
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>5개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>
                  {(() => {
                    const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 5, realCurrentDate.getDate());
                    return `${futureDate.getFullYear()}.${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
                  })()}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 7, realCurrentDate.getDate());
                  setTestDate(futureDate.getFullYear(), futureDate.getMonth() + 1, futureDate.getDate());
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>7개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>
                  {(() => {
                    const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 7, realCurrentDate.getDate());
                    return `${futureDate.getFullYear()}.${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
                  })()}
                </Text>
              </Pressable>
            </View>

            {/* 세 번째 행 */}
            <View style={styles.dateButtonRow}>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 8, realCurrentDate.getDate());
                  setTestDate(futureDate.getFullYear(), futureDate.getMonth() + 1, futureDate.getDate());
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>8개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>
                  {(() => {
                    const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 8, realCurrentDate.getDate());
                    return `${futureDate.getFullYear()}.${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
                  })()}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 9, realCurrentDate.getDate());
                  setTestDate(futureDate.getFullYear(), futureDate.getMonth() + 1, futureDate.getDate());
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>9개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>
                  {(() => {
                    const futureDate = new Date(realCurrentDate.getFullYear(), realCurrentDate.getMonth() + 9, realCurrentDate.getDate());
                    return `${futureDate.getFullYear()}.${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
                  })()}
                </Text>
              </Pressable>
            </View>

            {/* 복원 버튼 */}
            <Pressable
              style={[styles.restoreButton, { backgroundColor: colors.statusNegative }]}
              onPress={restoreDate}
            >
              <Text style={[styles.restoreButtonText, { color: colors.staticWhite }]}>
                🔄 날짜 복원
              </Text>
            </Pressable>
          </View>

          <SectionHeader title="🗑️ 데이터 관리" colors={colors} />
          
          <View style={styles.section}>
            <Pressable
              style={[styles.deleteButton, { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.statusNegative }]}
              onPress={async () => {
                try {
                  // AsyncStorage 캘린더 데이터 삭제
                  await AsyncStorage.multiRemove(['calendarData', 'incomeData', 'expenseData']);
                  storageCache.clearCache();
                  
                  // 지출 기록 삭제
                  try {
                    const { clearAllExpenses } = await import('@/utils/expenses');
                    await clearAllExpenses();
                    console.log('[dev-mode] 로컬 지출 기록 전체 삭제 완료');
                  } catch (_deleteError) {
                    console.error('지출 데이터 삭제 중 오류:', _deleteError);
                    // 삭제 실패해도 AsyncStorage 삭제는 완료되었으므로 계속 진행
                  }

                  // 입금 기록 삭제
                  try {
                    const { clearAllIncomes } = await import('@/utils/incomes');
                    await clearAllIncomes();
                    console.log('[dev-mode] 로컬 입금 기록 전체 삭제 완료');
                  } catch (_incomeDeleteError) {
                    console.error('입금 삭제 중 오류:', _incomeDeleteError);
                  }
                  
                  await refresh();
                  alert('캘린더 데이터가 삭제되었습니다.');
                } catch (_error) {
                  console.error('캘린더 데이터 삭제 중 오류:', _error);
                  alert('데이터 삭제 중 오류가 발생했습니다.');
                }
              }}
            >
              <Text style={[styles.deleteButtonText, { color: colors.statusNegative }]}>
                🗑️ 캘린더 데이터 삭제
              </Text>
            </Pressable>

            <Pressable
              style={[styles.deleteButton, { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.statusNegative }]}
              onPress={async () => {
                try {
                  await AsyncStorage.removeItem('challengeData');
                  storageCache.clearCache();
                  // 챌린지 기록 삭제
                  try {
                    const { clearAllChallenges } = await import('@/utils/challenges');
                    await clearAllChallenges();
                    console.log('[dev-mode] 로컬 챌린지 기록 전체 삭제 완료');
                  } catch (error) {
                    console.error('챌린지 삭제 중 오류:', error);
                    // 실패하더라도 로컬 삭제는 완료되었으므로 계속 진행
                  }
                  await refresh();
                  alert('챌린지 데이터가 삭제되었습니다.');
                } catch (error) {
                  console.error('챌린지 데이터 삭제 중 오류:', error);
                  alert('데이터 삭제 중 오류가 발생했습니다.');
                }
              }}
            >
              <Text style={[styles.deleteButtonText, { color: colors.statusNegative }]}>
                🗑️ 챌린지 데이터 삭제
              </Text>
            </Pressable>

            <Pressable
              style={[styles.deleteButton, { backgroundColor: colors.background, borderWidth: 2, borderColor: '#ff9800' }]}
              onPress={async () => {
                try {
                  await AsyncStorage.removeItem('hasRequestedNotificationPermission');

                  alert('알림 권한 요청 기록이 삭제되었습니다.\n앱을 재시작하면 다시 권한을 요청합니다.');
                } catch (error) {
                  console.error('알림 권한 리셋 중 오류:', error);
                  alert('알림 권한 리셋 중 오류가 발생했습니다.');
                }
              }}
            >
              <Text style={[styles.deleteButtonText, { color: '#ff9800' }]}>
                🔄 알림 권한 리셋
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <SectionHeader title="🧪 알림 테스트" colors={colors} />
      
      {/* Notification Test Buttons */}
      <View style={styles.section}>
        <Pressable
          style={[styles.testButton, { backgroundColor: colors.fill }]}
          onPress={() => sendTestNotification('expense')}
        >
          <Text style={[styles.testButtonText, { color: colors.text }]}>
            📝 소비 기록 유도 (2초 후)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: colors.fill }]}
          onPress={() => sendTestNotification('progress')}
        >
          <Text style={[styles.testButtonText, { color: colors.text }]}>
            📊 챌린지 현황 (2초 후)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: colors.fill }]}
          onPress={() => sendTestNotification('success')}
        >
          <Text style={[styles.testButtonText, { color: colors.text }]}>
            🎉 챌린지 성공 (2초 후)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: colors.fill }]}
          onPress={() => sendTestNotification('failure')}
        >
          <Text style={[styles.testButtonText, { color: colors.text }]}>
            ⚠️ 챌린지 실패 (2초 후)
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="📋 알림 관리" colors={colors} />
      
      <View style={styles.section}>
        <View style={styles.testButtonRow}>
          <Pressable
            style={[styles.testButtonSmall, { backgroundColor: colors.primary }]}
            onPress={async () => {
              const scheduled = await getScheduledNotifications();
              const generalNotifications = scheduled.filter(isGeneralNotification);
              const successNotifications = scheduled.filter(
                (n) => n.content.data?.type === 'challenge_success'
              );
              const progressCount = scheduled.filter(
                (n) => n.content.data?.type === 'challenge_progress'
              ).length;
              const failureCount = scheduled.filter(
                (n) => n.content.data?.type === 'challenge_failure'
              ).length;

              let summary =
                `전체 예약: ${scheduled.length}개\n` +
                `일반: ${generalNotifications.length} · 진행: ${progressCount} · 성공: ${successNotifications.length} · 실패: ${failureCount}\n\n`;

              if (generalNotifications.length > 0) {
                const generalDetails = (
                  await Promise.all(
                    generalNotifications.map(async (n) => {
                      const triggerDate = await formatTriggerDateLabel(n.trigger);
                      return `- ${n.identifier}\n  발송: ${triggerDate}`;
                    })
                  )
                ).join('\n\n');
                summary += `[일반]\n${generalDetails}\n\n`;
              }

              if (successNotifications.length > 0) {
                const details = (
                  await Promise.all(
                    successNotifications.map(async (n) => {
                      const challengeId = getNotificationDataString(n.content.data, 'challengeId', 'ID 없음');
                      const title = n.content.title || '';
                      const categoryMatch = title.match(/\[#(.+?)\]/);
                      const category = categoryMatch ? categoryMatch[1] : '카테고리 없음';
                      const percentage = getNotificationDataNumber(n.content.data, 'percentage');
                      const triggerDate = await formatTriggerDateLabel(n.trigger);
                      return `- ${title}\n  카테고리: ${category}\n  소비율: ${Math.round(percentage)}%\n  발송일: ${triggerDate}\n  ID: ${challengeId.substring(0, 8)}...`;
                    })
                  )
                ).join('\n\n');
                summary += `[챌린지 성공]\n${details}`;
              } else if (scheduled.length === 0) {
                summary += '예약된 알림이 없습니다.';
              } else if (generalNotifications.length === 0) {
                summary += '일반 알림 예약 없음. 챌린지 성공 알림도 없음.';
              }

              alert(summary);
            }}
          >
            <Text style={[styles.testButtonSmallText, { color: colors.staticWhite }]}>
              📋 예약 목록
            </Text>
          </Pressable>

          <Pressable
            style={[styles.testButtonSmall, { backgroundColor: colors.statusNegative }]}
            onPress={async () => {
              const remaining = await cancelAllNotifications();
              if (remaining.length > 0) {
                const details = remaining.map(n => {
                  const triggerType = getTriggerType(n.trigger);
                  const identifier = n.identifier || 'no identifier';
                  const title = n.content.title || 'no title';
                  return `- ${title}\n  ID: ${identifier}\n  Type: ${triggerType}`;
                }).join('\n\n');
                alert(`알림 취소 완료\n남은 알림: ${remaining.length}개\n\n남은 알림 상세:\n${details}`);
              } else {
                alert('모든 예약 알림 취소됨');
              }
            }}
          >
            <Text style={[styles.testButtonSmallText, { color: colors.staticWhite }]}>
              🗑️ 전체 취소
            </Text>
          </Pressable>
        </View>
        
        <View style={styles.testButtonRow}>
          <Pressable
            style={[styles.testButtonSmall, { backgroundColor: '#ff9800' }]}
            onPress={async () => {
              await clearChallengeNotificationMarks();
              alert('챌린지·일반 알림 마킹 초기화 + OS 예약 전체 취소 완료\n앱을 재시작하면 알림이 다시 스케줄됩니다.');
            }}
          >
            <Text style={[styles.testButtonSmallText, { color: colors.staticWhite }]}>
              🔄 알림 마킹 초기화
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#2E7D32', marginTop: 8 }]}
          onPress={async () => {
            try {
              const [snapshot, scheduled] = await Promise.all([
                getDailyReminderDebugSnapshot(),
                getScheduledNotifications(),
              ]);
              const generalScheduled = scheduled.filter(isGeneralNotification);

              let result = '일반 알림 (소비 유도 · 매일 20:00)\n\n';
              result += `설정: ${snapshot.generalEnabled ? 'ON' : 'OFF'}\n`;
              result += `시스템 권한: ${snapshot.permissionGranted ? '허용' : '거부/미확인'}\n`;
              result += `오늘 소비 기록: ${snapshot.hasExpenseToday ? '있음 → 당일 미스케줄' : '없음'}\n`;
              result += `오늘 스케줄 마킹: ${snapshot.todayScheduleMarkPresent ? '✅' : '❌'}\n`;
              result += `스케줄 조건 충족: ${snapshot.wouldSchedule ? '✅ (예약 시도 가능)' : '❌'}\n`;
              result += `OS 예약: ${generalScheduled.length}개\n\n`;

              if (generalScheduled.length > 0) {
                for (const notification of generalScheduled) {
                  const triggerDate = await formatTriggerDateLabel(notification.trigger);
                  const triggerType = getTriggerType(notification.trigger);
                  result += `- ${notification.identifier}\n`;
                  result += `  제목: ${notification.content.title ?? '(없음)'}\n`;
                  result += `  발송: ${triggerDate}\n`;
                  result += `  trigger: ${triggerType}\n\n`;
                }
              } else if (snapshot.wouldSchedule) {
                result +=
                  '⚠️ 조건은 충족인데 OS 예약 없음\n' +
                  '「일반 알림 재스케줄」또는 앱 재시작 후 setupDailyReminder를 확인하세요.';
              } else if (!snapshot.generalEnabled) {
                result += '일반 알림 OFF — 예약 없음이 정상입니다.';
              } else if (!snapshot.permissionGranted) {
                result += '권한 없음 — 예약 없음이 정상입니다.';
              } else if (snapshot.hasExpenseToday) {
                result += '오늘 소비 있음 — 당일 예약 없음이 정상입니다.';
              } else {
                result += '예약된 일반 알림이 없습니다.';
              }

              alert(result);
            } catch (error) {
              console.error('[test] Failed to check general notifications:', error);
              alert('일반 알림 확인 중 오류가 발생했습니다.');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            📝 일반 알림 확인 (20:00 소비 유도)
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="🎯 챌린지 알림 테스트" colors={colors} />
      
      <View style={styles.section}>
        <Pressable
          style={[styles.testButton, { backgroundColor: '#2196F3' }]}
          onPress={async () => {
            try {
              const challenges = await getAllChallenges();
              const activeChallenges = challenges.filter(c => !c.isDeleted);
              
              if (activeChallenges.length === 0) {
                alert('활성 챌린지가 없습니다.\n먼저 챌린지를 생성해주세요.');
                return;
              }
              
              const scheduled = await getScheduledNotifications();
              const progressNotifications = scheduled.filter(
                n => n.content.data?.type === 'challenge_progress'
              );
              
              let result = `진행현황 알림: ${progressNotifications.length}개\n\n`;
              
              // 각 챌린지별 진행현황 알림 확인
              for (const challenge of activeChallenges) {
                const status = await getChallengeStatus(challenge);
                
                result += `[${challenge.category}]\n`;
                result += `  기간: ${challenge.startDate} ~ ${challenge.endDate}\n`;
                result += `  목표: ${challenge.targetAmount.toLocaleString()}원\n`;
                result += `  현재: ${status.currentAmount.toLocaleString()}원 (${Math.round(status.percentage)}%)\n\n`;
                
                // 진행현황 알림 확인 (10%, 30%, 50%, 70%, 90%)
                const milestones = [10, 30, 50, 70, 90];
                const expectedMilestone = getProgressMilestoneForPercentage(status.percentage);
                const progressAlerts: string[] = [];
                for (let i = 0; i < milestones.length; i++) {
                  const milestone = milestones[i];
                  const max = i < milestones.length - 1 ? milestones[i + 1] : 100;
                  const isCurrentBand = expectedMilestone === milestone;
                  const isInRange = status.percentage >= milestone && status.percentage < max;

                  const notif = progressNotifications.find((n) => {
                    if (n.content.data?.challengeId !== challenge.id) {
                      return false;
                    }
                    const idMilestone = parseProgressNotificationMilestone(n.identifier, challenge.id);
                    if (idMilestone === milestone) {
                      return true;
                    }
                    const dataMilestone = getNotificationDataNumber(n.content.data, 'milestone', -1);
                    return dataMilestone === milestone;
                  });

                  if (notif) {
                    const storedPct = getNotificationDataNumber(notif.content.data, 'percentage');
                    const triggerDate = notif.trigger
                      ? await formatTriggerDateLabel(notif.trigger)
                      : '발송일 없음';
                    const pctMismatch =
                      isCurrentBand && Math.round(storedPct) !== Math.round(status.percentage);
                    const staleNote = !isCurrentBand
                      ? ' · 현재 구간과 불일치(잔여)'
                      : pctMismatch
                        ? ` · payload ${Math.round(storedPct)}% ≠ 현재 ${Math.round(status.percentage)}%`
                        : '';
                    progressAlerts.push(
                      triggerDate !== '발송일 없음'
                        ? `  ${milestone}%: ✅ ${triggerDate}${staleNote}\n     예약 시점 소비율: ${Math.round(storedPct)}%`
                        : `  ${milestone}%: ✅ 스케줄됨${staleNote}\n     예약 시점 소비율: ${Math.round(storedPct)}%`,
                    );
                  } else if (isInRange && isCurrentBand) {
                    progressAlerts.push(
                      `  ${milestone}%: ⚠️ 구간 해당·미예약 (post-anchor 없음 또는 발송 시각 과거)`,
                    );
                  } else {
                    progressAlerts.push(`  ${milestone}%: ❌ 없음`);
                  }
                }
                result += progressAlerts.join('\n') + '\n\n';
              }
              
              alert(result);
            } catch (error) {
              console.error('[test] Failed to check progress notifications:', error);
              alert('진행현황 알림 확인 중 오류가 발생했습니다.');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            📊 진행현황 알림 확인 (10%, 30%, 50%, 70%, 90%)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#9C27B0', marginTop: 12 }]}
          onPress={async () => {
            try {
              const scheduled = await getScheduledNotifications();
              const progressNotifications = scheduled.filter(
                n => n.content.data?.type === 'challenge_progress'
              );
              
              if (progressNotifications.length === 0) {
                alert('스케줄된 진행현황 알림이 없습니다.');
                return;
              }
              
              let result = `진행현황 알림 내용 미리보기: ${progressNotifications.length}개\n\n`;
              
              for (const notif of progressNotifications) {
                // title에서 category 추출: "[#카테고리] 챌린지 진행현황" 형식
                const title = notif.content.title || '';
                const categoryMatch = title.match(/\[#(.+?)\]/);
                const category = categoryMatch ? categoryMatch[1] : (title ? '카테고리 추출 실패' : '제목 없음');
                const challengeId = getNotificationDataString(notif.content.data, 'challengeId', 'ID 없음');
                const percentage = getNotificationDataNumber(notif.content.data, 'percentage');
                const body = notif.content.body || '';
                
                // trigger 정보 확인
                let triggerDate = '발송일 없음';
                let triggerInfo = '';
                if (notif.trigger) {
                  triggerDate = await formatTriggerDateLabel(notif.trigger);
                  if (triggerDate !== '발송일 없음') {
                    triggerInfo = getDailyTriggerText(notif.trigger)
                      ? '반복 알림'
                      : '스케줄됨 (아직 발송 안 됨)';
                  } else {
                    triggerInfo = `트리거 타입: ${getTriggerType(notif.trigger)}`;
                  }
                } else {
                  triggerInfo = '트리거 정보 없음';
                }
                
                result += `[${category}]\n`;
                result += `  제목: ${title || '(제목 없음)'}\n`;
                result += `  내용: ${body || '(내용 없음)'}\n`;
                result += `  소비율: ${Math.round(percentage)}%\n`;
                result += `  예약 발송일: ${triggerDate}\n`;
                if (triggerInfo) {
                  result += `  상태: ${triggerInfo}\n`;
                }
                result += `  ID: ${challengeId.substring(0, 8)}...\n\n`;
              }
              
              alert(result);
            } catch (error) {
              console.error('[test] Failed to preview notification content:', error);
              alert('알림 내용 확인 중 오류가 발생했습니다.');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            👁️ 진행현황 알림 내용 미리보기 (정수 확인)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#FF5722', marginTop: 12 }]}
          onPress={async () => {
            try {
              const challenges = await getAllChallenges();
              const activeChallenges = challenges.filter(c => !c.isDeleted);
              
              if (activeChallenges.length === 0) {
                alert('활성 챌린지가 없습니다.\n먼저 챌린지를 생성해주세요.');
                return;
              }
              
              const scheduled = await getScheduledNotifications();
              const failureNotifications = scheduled.filter(
                n => n.content.data?.type === 'challenge_failure'
              );
              
              let result = `실패 알림: ${failureNotifications.length}개\n\n`;
              
              // 각 챌린지별 실패 알림 확인
              for (const challenge of activeChallenges) {
                const status = await getChallengeStatus(challenge);
                
                result += `[${challenge.category}]\n`;
                result += `  기간: ${challenge.startDate} ~ ${challenge.endDate}\n`;
                result += `  목표: ${challenge.targetAmount.toLocaleString()}원\n`;
                result += `  현재: ${status.currentAmount.toLocaleString()}원 (${Math.round(status.percentage)}%)\n`;
                
                const hasFailureNotif = failureNotifications.some(
                  n => n.content.data?.challengeId === challenge.id
                );
                
                // 종료일 기준으로 우리가 의도한 예약 발송일(종료일+1일 09:30)을 직접 계산
                const endDateObj = new Date(challenge.endDate.replace(/\./g, '-'));
                endDateObj.setDate(endDateObj.getDate() + 1);
                endDateObj.setHours(9, 30, 0, 0);
                const expectedTriggerText = endDateObj.toLocaleString('ko-KR');
                
                if (hasFailureNotif) {
                  result += `  실패 알림: ✅\n  예약 발송일(종료일+1일 09:30 기준): ${expectedTriggerText}\n`;
                } else if (status.percentage > 100) {
                  const successMarked = await AsyncStorage.getItem(`challenge_success_${challenge.id}`);
                  const failureMarked = await AsyncStorage.getItem(`challenge_failure_${challenge.id}`);
                  if (successMarked && !failureMarked) {
                    result +=
                      `  실패 알림: ⚠️ OS 예약 없음 (성공만 마킹됨 — 해당 카테고리 기록 저장 한 번 더 하거나 앱 재실행)\n`;
                  } else {
                    result += `  실패 알림: ⚠️ 100% 초과 — OS 예약 없음 (챌린지 알림 ON·기록 저장 후 확인)\n`;
                  }
                } else {
                  result += `  실패 알림: ❌ 없음 (100% 이하)\n`;
                }
                result += '\n';
              }
              
              alert(result);
            } catch (error) {
              console.error('[test] Failed to check failure notifications:', error);
              alert('실패 알림 확인 중 오류가 발생했습니다.');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            ⚠️ 실패 알림 확인 (100% 초과)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#4CAF50', marginTop: 12 }]}
          onPress={async () => {
            try {
              const challenges = await getAllChallenges();
              const activeChallenges = challenges.filter(c => !c.isDeleted);
              
              if (activeChallenges.length === 0) {
                alert('활성 챌린지가 없습니다.\n먼저 챌린지를 생성해주세요.');
                return;
              }
              
              const scheduled = await getScheduledNotifications();
              const successNotifications = scheduled.filter(
                n => n.content.data?.type === 'challenge_success'
              );
              
              let result = `성공 알림: ${successNotifications.length}개\n\n`;
              
              // 각 챌린지별 성공 알림 확인
              for (const challenge of activeChallenges) {
                const status = await getChallengeStatus(challenge);
                
                result += `[${challenge.category}]\n`;
                result += `  기간: ${challenge.startDate} ~ ${challenge.endDate}\n`;
                result += `  목표: ${challenge.targetAmount.toLocaleString()}원\n`;
                result += `  현재: ${status.currentAmount.toLocaleString()}원 (${Math.round(status.percentage)}%)\n`;
                
                const hasSuccessNotif = successNotifications.some(
                  n => n.content.data?.challengeId === challenge.id
                );
                
                // 종료일 기준으로 우리가 의도한 예약 발송일(종료일+1일 09:30)을 직접 계산
                const endDateObj = new Date(challenge.endDate.replace(/\./g, '-'));
                endDateObj.setDate(endDateObj.getDate() + 1);
                endDateObj.setHours(9, 30, 0, 0);
                const expectedTriggerText = endDateObj.toLocaleString('ko-KR');
                
                if (hasSuccessNotif) {
                  result += `  성공 알림: ✅\n  예약 발송일(종료일+1일 09:30 기준): ${expectedTriggerText}\n`;
                } else {
                  if (status.percentage > 100) {
                    result += `  성공 알림: ❌ 없음 (소비율 초과)\n`;
                  } else {
                    result += `  성공 알림: ❌ 없음\n`;
                  }
                }
                result += '\n';
              }
              
              alert(result);
            } catch (error) {
              console.error('[test] Failed to check success notifications:', error);
              alert('성공 알림 확인 중 오류가 발생했습니다.');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            🎉 성공 알림 확인 (≤ 100%)
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="ℹ️ 안내" colors={colors} />
      
      <View style={styles.section}>
        <Pressable
          style={[styles.testButton, { backgroundColor: '#455A64' }]}
          onPress={async () => {
            const [generalEnabled, challengeEnabled, scheduled] = await Promise.all([
              getGeneralNotificationsEnabled(),
              getChallengeNotificationsEnabled(),
              getScheduledNotifications(),
            ]);
            const generalCount = scheduled.filter(isGeneralNotification).length;
            const challengeCount = scheduled.filter(isChallengeNotification).length;
            alert(
              `분기 상태\n\n` +
                `일반 알림: ${generalEnabled ? 'ON' : 'OFF'}\n` +
                `챌린지 알림: ${challengeEnabled ? 'ON' : 'OFF'}\n\n` +
                `일반 예약 수: ${generalCount}\n` +
                `챌린지 예약 수: ${challengeCount}\n` +
                `전체 예약 수: ${scheduled.length}`
            );
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            🔀 분기 상태 조회
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#1E88E5' }]}
          onPress={async () => {
            const generalEnabled = await getGeneralNotificationsEnabled();
            if (generalEnabled) {
              await setupDailyReminder();
            } else {
              await cancelDailyReminder();
            }
            const scheduled = await getScheduledNotifications();
            const generalScheduled = scheduled.filter(isGeneralNotification);
            const generalDetails = generalScheduled
              .map((notification) => {
                const type = String(notification.content.data?.type ?? 'unknown');
                return `- ${notification.identifier} (${type})`;
              })
              .join('\n');
            alert(
              `일반 알림 재평가 완료\n\n` +
                `설정 상태: ${generalEnabled ? 'ON' : 'OFF'}\n` +
                `예약 수: ${generalScheduled.length}\n\n` +
                `${generalDetails || '예약된 일반 알림이 없습니다.'}`
            );
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            🔁 일반 알림 재스케줄 테스트
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#8E24AA' }]}
          onPress={async () => {
            const challengeEnabled = await getChallengeNotificationsEnabled();
            if (challengeEnabled) {
              await checkActiveChallengesNotifications();
              await checkEndedChallenges();
            }
            const scheduled = await getScheduledNotifications();
            const challengeScheduled = scheduled.filter(isChallengeNotification);
            alert(
              `챌린지 알림 재평가 완료\n\n` +
                `설정 상태: ${challengeEnabled ? 'ON' : 'OFF'}\n` +
                `예약 수: ${challengeScheduled.length}\n` +
                `(progress/success/failure 합산)`
            );
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            🔁 챌린지 알림 재평가 테스트
          </Text>
        </Pressable>

        <SectionHeader title="📊 challenge_result 분석" colors={colors} />

        <Pressable
          style={[styles.testButton, { backgroundColor: '#00796B' }]}
          onPress={async () => {
            try {
              await emitEndedChallengeResultAnalytics();
              const challenges = await getAllChallenges();
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const endedCount = challenges.filter((c) => {
                if (c.isDeleted) return false;
                const end = new Date(c.endDate.replace(/\./g, '-'));
                end.setHours(0, 0, 0, 0);
                return end.getTime() < today.getTime();
              }).length;
              alert(
                `challenge_result 전송 로직 실행함\n\n` +
                  `로컬 챌린지 중 종료일이 오늘(로컬)보다 이전인 ${endedCount}개가 대상입니다.\n` +
                  `이미 전송 마킹된 id는 스킵됩니다.\n\n` +
                  `상세·마킹 전후는 아래 「상태 요약」 버튼을 쓰세요.`
              );
            } catch (e) {
              console.error(e);
              alert('실행 실패 — 콘솔 확인');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            📤 challenge_result 즉시 전송 (저장된 챌린지 기준)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#00695C' }]}
          onPress={async () => {
            try {
              const challenges = await getAllChallenges();
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const ended = challenges.filter((c) => {
                if (c.isDeleted) return false;
                const end = new Date(c.endDate.replace(/\./g, '-'));
                end.setHours(0, 0, 0, 0);
                return end.getTime() < today.getTime();
              });
              const beforeLines: string[] = [];
              for (const c of ended) {
                const key = `challenge_result_logged_${c.id}`;
                const logged = await AsyncStorage.getItem(key);
                const status = await getChallengeStatus(c);
                const result = status.percentage <= 100 ? 'success' : 'fail';
                beforeLines.push(
                  `· ${c.category} ~${c.endDate} | ${result} | 전송됨=${logged ? 'Y' : 'N'}`,
                );
              }
              await emitEndedChallengeResultAnalytics();
              const afterLines: string[] = [];
              for (const c of ended) {
                const key = `challenge_result_logged_${c.id}`;
                const logged = await AsyncStorage.getItem(key);
                afterLines.push(`· ${c.id.slice(0, 8)}… 전송마킹=${logged ? 'Y' : 'N'}`);
              }
              alert(
                `emitEndedChallengeResultAnalytics 실행\n\n` +
                  `종료 후보 ${ended.length}개 (실행 전 → 후 마킹)\n\n` +
                  `${beforeLines.join('\n') || '(해당 없음)'}\n\n` +
                  `— 마킹 —\n${afterLines.join('\n') || '-'}\n\n` +
                  `Amplitude 디버거/이벤트 스트림에서 challenge_result 확인`
              );
            } catch (e) {
              console.error(e);
              alert('실행 실패 — 콘솔 확인');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            ▶ challenge_result 분석 실행 (상태 요약)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#37474F' }]}
          onPress={async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              const toRemove = keys.filter((k) => k.startsWith('challenge_result_logged_'));
              if (toRemove.length === 0) {
                alert('challenge_result_logged_* 키 없음');
                return;
              }
              await AsyncStorage.multiRemove(toRemove);
              alert(`제거 완료: ${toRemove.length}개\n다시 ▶ 실행하면 이벤트 재전송 시도`);
            } catch (e) {
              console.error(e);
              alert('초기화 실패');
            }
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            🧹 challenge_result 전송 마킹 초기화
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#5D4037' }]}
          onPress={async () => {
            const scheduled = await getScheduledNotifications();
            const expenseReminder = scheduled.filter(
              (notification) => notification.content.data?.type === 'expense_reminder'
            ).length;
            const challengeProgress = scheduled.filter(
              (notification) => notification.content.data?.type === 'challenge_progress'
            ).length;
            const challengeSuccess = scheduled.filter(
              (notification) => notification.content.data?.type === 'challenge_success'
            ).length;
            const challengeFailure = scheduled.filter(
              (notification) => notification.content.data?.type === 'challenge_failure'
            ).length;
            const getTriggerSummary = async (trigger: unknown): Promise<string> => {
              if (!trigger || typeof trigger !== 'object') {
                return 'none';
              }

              const triggerType = getTriggerType(trigger);
              const triggerDate = await formatTriggerDateLabel(trigger);
              if (triggerDate !== '발송일 없음') {
                return `${triggerType} @ ${triggerDate}`;
              }

              return triggerType;
            };

            const details = (
              await Promise.all(
                scheduled.map(async (notification, index) => {
                  const type = String(notification.content.data?.type ?? 'unknown');
                  const title = notification.content.title ?? '(제목 없음)';
                  const trigger = await getTriggerSummary(notification.trigger);
                  return `${index + 1}. ${title}\n- id: ${notification.identifier}\n- type: ${type}\n- trigger: ${trigger}`;
                })
              )
            ).join('\n\n');
            alert(
              `타입별 예약 목록\n\n` +
                `expense_reminder: ${expenseReminder}\n` +
                `challenge_progress: ${challengeProgress}\n` +
                `challenge_success: ${challengeSuccess}\n` +
                `challenge_failure: ${challengeFailure}\n\n` +
                `전체 예약 수: ${scheduled.length}\n\n` +
                `${details || '예약 상세 없음'}`
            );
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            📋 타입별 예약 목록
          </Text>
        </Pressable>

        <Pressable
          style={[styles.testButton, { backgroundColor: '#263238' }]}
          onPress={async () => {
            const parseBooleanLabel = (rawValue: string | null): string => {
              if (rawValue === null) return 'null';
              if (rawValue === 'true' || rawValue === 'false') return rawValue;
              try {
                const parsed = JSON.parse(rawValue);
                if (typeof parsed === 'boolean') {
                  return String(parsed);
                }
                return `invalid(${rawValue})`;
              } catch {
                return `invalid(${rawValue})`;
              }
            };

            const [generalEnabled, challengeEnabled, legacyRaw, scheduled] = await Promise.all([
              getGeneralNotificationsEnabled(),
              getChallengeNotificationsEnabled(),
              AsyncStorage.getItem('notificationsEnabled'),
              getScheduledNotifications(),
            ]);

            const detailedRows = scheduled
              .map((notification, index) => {
                const dataType = String(notification.content.data?.type ?? 'unknown');
                const title = notification.content.title ?? '(제목 없음)';
                const triggerType =
                  notification.trigger && typeof notification.trigger === 'object' && 'type' in notification.trigger
                    ? String((notification.trigger as { type?: unknown }).type ?? 'unknown')
                    : 'none';
                return (
                  `${index + 1}. ${title}\n` +
                  `- id: ${notification.identifier}\n` +
                  `- data.type: ${dataType}\n` +
                  `- trigger.type: ${triggerType}`
                );
              })
              .join('\n\n');

            alert(
              `진단 리포트\n\n` +
                `[설정 키]\n` +
                `- generalNotificationsEnabled: ${generalEnabled}\n` +
                `- challengeNotificationsEnabled: ${challengeEnabled}\n` +
                `- notificationsEnabled(legacy): ${parseBooleanLabel(legacyRaw)}\n\n` +
                `[예약 알림]\n` +
                `- count: ${scheduled.length}\n\n` +
                `${detailedRows || '예약 알림 없음'}`
            );
          }}
        >
          <Text style={[styles.testButtonText, { color: colors.staticWhite }]}>
            🧾 키/스케줄 진단 리포트
          </Text>
        </Pressable>
      </View>
      
      <View style={[styles.infoBox, { backgroundColor: colors.fillAlt }]}>
        <Text style={[styles.infoText, { color: colors.textNeutral }]}>
          • 알림 설정이 ON이고 권한이 허용된 경우에만 알림이 발송됩니다.{'\n'}
          • 버튼 클릭 후 2초 뒤에 알림이 표시됩니다.{'\n'}
          • 백그라운드로 전환하면 실제 푸시 알림을 받을 수 있습니다.{'\n'}
          • 마이페이지에서 알림 설정을 확인하세요.
        </Text>
      </View>
    </>
  );
}

/**
 * Buttons Content
 */
function ButtonsContent({ colors }: { colors: ColorPalette }) {
  return (
    <>
      {/* Primary Buttons - Solid */}
      <SectionHeader title="Primary - Solid" colors={colors} />
      <View style={styles.buttonRow}>
        <Button variant="primary" type="solid" size="large" onPress={() => {}}>
          Large
        </Button>
        <Button variant="primary" type="solid" size="small" onPress={() => {}}>
          Small
        </Button>
      </View>
      <View style={styles.buttonRow}>
        <Button variant="primary" type="solid" size="large" onPress={() => {}} disabled>
          Disabled
        </Button>
        <Button variant="primary" type="solid" size="small" onPress={() => {}} disabled>
          Disabled
        </Button>
      </View>

      {/* Primary Buttons - Line */}
      <SectionHeader title="Primary - Line" colors={colors} />
      <View style={styles.buttonRow}>
        <Button variant="primary" type="line" size="large" onPress={() => {}}>
          Large
        </Button>
        <Button variant="primary" type="line" size="small" onPress={() => {}}>
          Small
        </Button>
      </View>
      <View style={styles.buttonRow}>
        <Button variant="primary" type="line" size="large" onPress={() => {}} disabled>
          Disabled
        </Button>
        <Button variant="primary" type="line" size="small" onPress={() => {}} disabled>
          Disabled
        </Button>
      </View>

      {/* Negative Buttons - Solid */}
      <SectionHeader title="Negative - Solid" colors={colors} />
      <View style={styles.buttonRow}>
        <Button variant="negative" type="solid" size="large" onPress={() => {}}>
          Large
        </Button>
        <Button variant="negative" type="solid" size="small" onPress={() => {}}>
          Small
        </Button>
      </View>
      <View style={styles.buttonRow}>
        <Button variant="negative" type="solid" size="large" onPress={() => {}} disabled>
          Disabled
        </Button>
        <Button variant="negative" type="solid" size="small" onPress={() => {}} disabled>
          Disabled
        </Button>
      </View>

      {/* Negative Buttons - Line */}
      <SectionHeader title="Negative - Line" colors={colors} />
      <View style={styles.buttonRow}>
        <Button variant="negative" type="line" size="large" onPress={() => {}}>
          Large
        </Button>
        <Button variant="negative" type="line" size="small" onPress={() => {}}>
          Small
        </Button>
      </View>
      <View style={styles.buttonRow}>
        <Button variant="negative" type="line" size="large" onPress={() => {}} disabled>
          Disabled
        </Button>
        <Button variant="negative" type="line" size="small" onPress={() => {}} disabled>
          Disabled
        </Button>
      </View>

      {/* Assistive Buttons - Solid */}
      <SectionHeader title="Assistive - Solid" colors={colors} />
      <View style={styles.buttonRow}>
        <Button variant="assistive" type="solid" size="large" onPress={() => {}}>
          Large
        </Button>
        <Button variant="assistive" type="solid" size="small" onPress={() => {}}>
          Small
        </Button>
      </View>
      <View style={styles.buttonRow}>
        <Button variant="assistive" type="solid" size="large" onPress={() => {}} disabled>
          Disabled
        </Button>
        <Button variant="assistive" type="solid" size="small" onPress={() => {}} disabled>
          Disabled
        </Button>
      </View>

      {/* Assistive Buttons - Line */}
      <SectionHeader title="Assistive - Line" colors={colors} />
      <View style={styles.buttonRow}>
        <Button variant="assistive" type="line" size="large" onPress={() => {}}>
          Large
        </Button>
        <Button variant="assistive" type="line" size="small" onPress={() => {}}>
          Small
        </Button>
      </View>
      <View style={styles.buttonRow}>
        <Button variant="assistive" type="line" size="large" onPress={() => {}} disabled>
          Disabled
        </Button>
        <Button variant="assistive" type="line" size="small" onPress={() => {}} disabled>
          Disabled
        </Button>
      </View>

      {/* Real-world Examples */}
      <SectionHeader title="Real-world Examples" colors={colors} />
      <View style={styles.column}>
        <Button variant="primary" type="solid" size="large" onPress={() => {}}>
          확인
        </Button>
        <Button variant="negative" type="line" size="large" onPress={() => {}}>
          삭제
        </Button>
        <View style={styles.buttonRow}>
          <Button variant="assistive" type="line" size="small" onPress={() => {}}>
            취소
          </Button>
          <Button variant="primary" type="solid" size="small" onPress={() => {}}>
            저장
          </Button>
        </View>
      </View>

      {/* Button Specs */}
      <SectionHeader title="Button Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Large Height" value="56px" colors={colors} />
        <SpecItem label="Small Height" value="40px" colors={colors} />
        <SpecItem label="Border Radius" value="12px" colors={colors} />
        <SpecItem label="Font Size" value="16px" colors={colors} />
        <SpecItem label="Font Weight" value="Bold (700)" colors={colors} />
      </View>
    </>
  );
}

/**
 * Inputs Content
 */
function InputsContent({ colors }: { colors: ColorPalette }) {
  const [text, setText] = useState('');
  const [textActive, setTextActive] = useState('내용');
  const [number, setNumber] = useState('');

  return (
    <>
      {/* Line Inputs - Default */}
      <SectionHeader title="Line Input - Default" colors={colors} />
      <Input
        placeholder="내용 입력"
        value={text}
        onChangeText={setText}
      />

      {/* Line Inputs - With Icon */}
      <SectionHeader title="Line Input - With Icon" colors={colors} />
      <Input
        icon="person"
        placeholder="이름 입력"
        value=""
        onChangeText={() => {}}
      />

      {/* Line Inputs - Active */}
      <SectionHeader title="Line Input - Active" colors={colors} />
      <Input
        icon="person"
        placeholder="내용 입력"
        value={textActive}
        onChangeText={setTextActive}
      />

      {/* Payment Type Inputs */}
      <SectionHeader title="Line Input - Payment Type (Regular)" colors={colors} />
      <Input
        value="내용 입력"
        buttonMode
        sortation
        sortationColor={colors.primary}
        showSortationDot
        showRightArrow
        rightIcon="arrowDown"
        onPress={() => {}}
      />

      <SectionHeader title="Line Input - Payment Type (Short)" colors={colors} />
      <Input
        value="내용 입력"
        buttonMode
        shortver
        sortation
        sortationColor={colors.primary}
        showSortationDot
        showRightArrow
        rightIcon="arrowDown"
        style={{ width: 200 }}
        onPress={() => {}}
      />

      {/* Line Inputs - With Time */}
      <SectionHeader title="Line Input - With Time" colors={colors} />
      <Input
        placeholder="내용 입력"
        value=""
        onChangeText={() => {}}
        timeDisplay="2:53"
      />

      {/* Line Inputs - Disabled */}
      <SectionHeader title="Line Input - Disabled" colors={colors} />
      <Input
        icon="person"
        placeholder="내용 입력"
        value=""
        onChangeText={() => {}}
        disabled
      />

      {/* Number Inputs */}
      <SectionHeader title="Number Input - Default" colors={colors} />
      <Input
        inputType="number"
        value={number}
        onChangeText={setNumber}
        unit="원"
      />

      <SectionHeader title="Number Input - Active" colors={colors} />
      <Input
        inputType="number"
        value="20,000"
        onChangeText={() => {}}
        unit="원"
      />

      <SectionHeader title="Number Input - Disabled" colors={colors} />
      <Input
        inputType="number"
        value="20,000"
        onChangeText={() => {}}
        unit="원"
        disabled
      />

      {/* Calendar Inputs */}
      <SectionHeader title="Calendar Input - Default" colors={colors} />
      <Input
        calendar
      />

      <SectionHeader title="Calendar Input - Active" colors={colors} />
      <Input
        calendar
        calendarDate="2025.09.28"
      />

      <SectionHeader title="Calendar Input - Disabled" colors={colors} />
      <Input
        calendar
        calendarDate="2025.09.28"
        disabled
      />

      {/* Textarea */}
      <SectionHeader title="Textarea - Default" colors={colors} />
      <Input
        variant="area"
        placeholder="메모를 입력해 주세요.(최대 20자)"
        value=""
        onChangeText={() => {}}
        maxLength={20}
      />

      <SectionHeader title="Textarea - Disabled" colors={colors} />
      <Input
        variant="area"
        placeholder="메모를 입력해 주세요.(최대 20자)"
        value=""
        onChangeText={() => {}}
        disabled
      />
    </>
  );
}

/**
 * Selectboxs Content
 */
function SelectboxsContent({ colors }: { colors: ColorPalette }) {
  const [category, setCategory] = useState('');
  const [categoryWithValue, setCategoryWithValue] = useState('food');

  const categoryOptions = [
    { label: '식비', value: 'food' },
    { label: '교통비', value: 'transport' },
    { label: '쇼핑', value: 'shopping' },
    { label: '문화생활', value: 'culture' },
    { label: '의료/건강', value: 'health' },
    { label: '교육', value: 'education' },
  ];

  return (
    <>
      {/* Default State - No Selection */}
      <SectionHeader title="Selectbox - Default (No Selection)" colors={colors} />
      <Selectbox
        options={categoryOptions}
        value={category}
        onValueChange={setCategory}
        placeholder="카테고리 선택"
        title="카테고리"
      />

      {/* Active State - With Selection */}
      <SectionHeader title="Selectbox - Active (With Selection)" colors={colors} />
      <Selectbox
        options={categoryOptions}
        value={categoryWithValue}
        onValueChange={setCategoryWithValue}
        placeholder="카테고리 선택"
        title="카테고리"
      />

      {/* Disabled State */}
      <SectionHeader title="Selectbox - Disabled" colors={colors} />
      <Selectbox
        options={categoryOptions}
        value="food"
        onValueChange={() => {}}
        placeholder="카테고리 선택"
        title="카테고리"
        disabled
      />

      {/* Selectbox Specs */}
      <SectionHeader title="Selectbox Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Height" value="48px" colors={colors} />
        <SpecItem label="Border Radius" value="12px" colors={colors} />
        <SpecItem label="Padding" value="12px" colors={colors} />
        <SpecItem label="Font Size" value="16px" colors={colors} />
        <SpecItem label="Picker Type" value="Native (iOS/Android)" colors={colors} />
      </View>
    </>
  );
}

/**
 * Radios Content
 */
function RadiosContent({ colors }: { colors: ColorPalette }) {
  const [payment, setPayment] = useState('credit');
  const [singleChecked, setSingleChecked] = useState(false);

  const paymentOptions = [
    { label: '신용카드', value: 'credit' },
    { label: '체크카드', value: 'debit' },
    { label: '계좌이체', value: 'transfer' },
    { label: '무통장입금', value: 'deposit' },
  ];

  return (
    <>
      {/* Single Radio - All States */}
      <SectionHeader title="Single Radio - Default (Unchecked)" colors={colors} />
      <Radio
        checked={false}
        onPress={() => {}}
        label="선택 가능"
      />

      <SectionHeader title="Single Radio - Active (Checked)" colors={colors} />
      <Radio
        checked={true}
        onPress={() => {}}
        label="선택됨"
      />

      <SectionHeader title="Single Radio - Disabled (Unchecked)" colors={colors} />
      <Radio
        checked={false}
        onPress={() => {}}
        label="비활성화"
        disabled
      />

      <SectionHeader title="Single Radio - Disabled (Checked)" colors={colors} />
      <Radio
        checked={true}
        onPress={() => {}}
        label="선택됨 (비활성화)"
        disabled
      />

      {/* Radio Without Label */}
      <SectionHeader title="Radio Without Label" colors={colors} />
      <View style={styles.radioRow}>
        <Radio checked={false} onPress={() => {}} />
        <Radio checked={true} onPress={() => {}} />
        <Radio checked={false} onPress={() => {}} disabled />
        <Radio checked={true} onPress={() => {}} disabled />
      </View>

      {/* Interactive Radio */}
      <SectionHeader title="Interactive Radio" colors={colors} />
      <Radio
        checked={singleChecked}
        onPress={() => setSingleChecked(!singleChecked)}
        label="클릭해서 선택/해제"
      />

      {/* RadioGroup - Vertical */}
      <SectionHeader title="RadioGroup - Vertical" colors={colors} />
      <RadioGroup
        options={paymentOptions}
        value={payment}
        onValueChange={setPayment}
      />

      {/* RadioGroup - Disabled */}
      <SectionHeader title="RadioGroup - Disabled" colors={colors} />
      <RadioGroup
        options={paymentOptions}
        value="credit"
        onValueChange={() => {}}
        disabled
      />

      {/* Radio Specs */}
      <SectionHeader title="Radio Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Outer Size" value="20×20px" colors={colors} />
        <SpecItem label="Inner Size" value="10×10px" colors={colors} />
        <SpecItem label="Border Radius" value="10px (circle)" colors={colors} />
        <SpecItem label="Label Font" value="Pretendard Medium 14" colors={colors} />
        <SpecItem label="Label Gap" value="8px" colors={colors} />
      </View>
    </>
  );
}

/**
 * Checkboxes Content
 */
function CheckboxesContent({ colors }: { colors: ColorPalette }) {
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [singleChecked, setSingleChecked] = useState(false);

  return (
    <>
      {/* Single Checkbox - All States */}
      <SectionHeader title="Checkbox - Default (Unchecked)" colors={colors} />
      <Checkbox
        checked={false}
        onPress={() => {}}
        label="선택 가능"
      />

      <SectionHeader title="Checkbox - Active (Checked)" colors={colors} />
      <Checkbox
        checked={true}
        onPress={() => {}}
        label="선택됨"
      />

      <SectionHeader title="Checkbox - Disabled (Unchecked)" colors={colors} />
      <Checkbox
        checked={false}
        onPress={() => {}}
        label="비활성화"
        disabled
      />

      <SectionHeader title="Checkbox - Disabled (Checked)" colors={colors} />
      <Checkbox
        checked={true}
        onPress={() => {}}
        label="선택됨 (비활성화)"
        disabled
      />

      {/* Checkbox Without Label */}
      <SectionHeader title="Checkbox Without Label" colors={colors} />
      <View style={styles.radioRow}>
        <Checkbox checked={false} onPress={() => {}} />
        <Checkbox checked={true} onPress={() => {}} />
        <Checkbox checked={false} onPress={() => {}} disabled />
        <Checkbox checked={true} onPress={() => {}} disabled />
      </View>

      {/* Interactive Checkbox */}
      <SectionHeader title="Interactive Checkbox" colors={colors} />
      <Checkbox
        checked={singleChecked}
        onPress={() => setSingleChecked(!singleChecked)}
        label="클릭해서 선택/해제"
      />

      {/* Real-world Example */}
      <SectionHeader title="Real-world Example" colors={colors} />
      <View style={styles.column}>
        <Checkbox
          checked={agree}
          onPress={() => setAgree(!agree)}
          label="개인정보 수집 및 이용에 동의합니다."
        />
        <Checkbox
          checked={marketing}
          onPress={() => setMarketing(!marketing)}
          label="마케팅 정보 수신에 동의합니다. (선택)"
        />
      </View>

      {/* Checkbox Specs */}
      <SectionHeader title="Checkbox Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Size" value="20×20px" colors={colors} />
        <SpecItem label="Border Radius" value="4px" colors={colors} />
        <SpecItem label="Check Icon" value="16×16px" colors={colors} />
        <SpecItem label="Label Font" value="Pretendard Medium 14" colors={colors} />
        <SpecItem label="Label Gap" value="8px" colors={colors} />
      </View>
    </>
  );
}

/**
 * Switches Content
 */
function SwitchesContent({ colors }: { colors: ColorPalette }) {
  const [switch1, setSwitch1] = useState(false);
  const [switch2, setSwitch2] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  return (
    <>
      {/* Switch - Off */}
      <SectionHeader title="Switch - Off" colors={colors} />
      <Switch
        value={false}
        onValueChange={() => {}}
      />

      {/* Switch - On */}
      <SectionHeader title="Switch - On" colors={colors} />
      <Switch
        value={true}
        onValueChange={() => {}}
      />

      {/* Switch - Disabled (Figma only has one disabled state) */}
      <SectionHeader title="Switch - Disabled" colors={colors} />
      <Switch
        value={false}
        onValueChange={() => {}}
        disabled
      />

      {/* Interactive Switches */}
      <SectionHeader title="Interactive Switches" colors={colors} />
      <View style={styles.column}>
        <View style={styles.switchRow}>
          <Text style={[typography.body01.medium, { color: colors.text }]}>
            Switch 1
          </Text>
          <Switch
            value={switch1}
            onValueChange={setSwitch1}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={[typography.body01.medium, { color: colors.text }]}>
            Switch 2
          </Text>
          <Switch
            value={switch2}
            onValueChange={setSwitch2}
          />
        </View>
      </View>

      {/* Real-world Examples */}
      <SectionHeader title="Real-world Examples" colors={colors} />
      <View style={styles.column}>
        <View style={styles.switchRow}>
          <View>
            <Text style={[typography.body01.medium, { color: colors.text }]}>
              알림 받기
            </Text>
            <Text style={[typography.body02.regular, { color: colors.textNeutral }]}>
              새로운 거래 알림을 받습니다
            </Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
          />
        </View>
        <View style={styles.switchRow}>
          <View>
            <Text style={[typography.body01.medium, { color: colors.text }]}>
              다크 모드
            </Text>
            <Text style={[typography.body02.regular, { color: colors.textNeutral }]}>
              어두운 테마 사용
            </Text>
          </View>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
          />
        </View>
      </View>

      {/* Switch Specs */}
      <SectionHeader title="Switch Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Size" value="56×32px" colors={colors} />
        <SpecItem label="Toggle Size" value="24×24px" colors={colors} />
        <SpecItem label="Border Radius" value="20px" colors={colors} />
        <SpecItem label="Color (On)" value="#07b63b (Green)" colors={colors} />
        <SpecItem label="Color (Off)" value="Gray (opacity 0.16)" colors={colors} />
        <SpecItem label="Animation" value="Spring (tension 100)" colors={colors} />
      </View>
    </>
  );
}

/**
 * Modals Content
 */
function ModalsContent({ colors }: { colors: ColorPalette }) {
  const [showAlertWithTitle, setShowAlertWithTitle] = useState(false);
  const [showAlertNoTitle, setShowAlertNoTitle] = useState(false);
  const [showConfirmWithTitle, setShowConfirmWithTitle] = useState(false);
  const [showConfirmNoTitle, setShowConfirmNoTitle] = useState(false);

  return (
    <>
      {/* Alert - With Title */}
      <SectionHeader title="Alert - 타이틀 있음 (1버튼)" colors={colors} />
      <Button
        variant="primary"
        size="large"
        onPress={() => setShowAlertWithTitle(true)}
      >
        알림 모달 열기
      </Button>
      <ModalPopup
        visible={showAlertWithTitle}
        title="알림"
        confirmText="확인"
        onConfirm={() => setShowAlertWithTitle(false)}
      >
        <Text style={[typography.body01.regular, { color: colors.textNeutral, textAlign: 'center' }]}>
          내용을 입력해 주세요.
        </Text>
      </ModalPopup>

      {/* Alert - No Title */}
      <SectionHeader title="Alert - 타이틀 없음 (1버튼)" colors={colors} />
      <Button
        variant="primary"
        size="large"
        onPress={() => setShowAlertNoTitle(true)}
      >
        알림 모달 열기
      </Button>
      <ModalPopup
        visible={showAlertNoTitle}
        confirmText="확인"
        onConfirm={() => setShowAlertNoTitle(false)}
      >
        <Text style={[typography.body01.regular, { color: colors.textNeutral, textAlign: 'center' }]}>
          내용을 입력해 주세요.
        </Text>
      </ModalPopup>

      {/* Confirm - With Title */}
      <SectionHeader title="Confirm - 타이틀 있음 (2버튼)" colors={colors} />
      <Button
        variant="primary"
        size="large"
        onPress={() => setShowConfirmWithTitle(true)}
      >
        확인 모달 열기
      </Button>
      <ModalPopup
        visible={showConfirmWithTitle}
        title="타이틀"
        confirmText="확인"
        cancelText="취소"
        onConfirm={() => setShowConfirmWithTitle(false)}
        onCancel={() => setShowConfirmWithTitle(false)}
      >
        <Text style={[typography.body01.regular, { color: colors.textNeutral, textAlign: 'center' }]}>
          내용을 입력해 주세요.
        </Text>
      </ModalPopup>

      {/* Confirm - No Title */}
      <SectionHeader title="Confirm - 타이틀 없음 (2버튼)" colors={colors} />
      <Button
        variant="primary"
        size="large"
        onPress={() => setShowConfirmNoTitle(true)}
      >
        확인 모달 열기
      </Button>
      <ModalPopup
        visible={showConfirmNoTitle}
        confirmText="확인"
        cancelText="취소"
        onConfirm={() => setShowConfirmNoTitle(false)}
        onCancel={() => setShowConfirmNoTitle(false)}
      >
        <Text style={[typography.body01.regular, { color: colors.textNeutral, textAlign: 'center' }]}>
          내용을 입력해 주세요.
        </Text>
      </ModalPopup>

      {/* Modal Specs */}
      <SectionHeader title="Modal Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Width" value="343px" colors={colors} />
        <SpecItem label="Border Radius" value="24px" colors={colors} />
        <SpecItem label="Padding" value="24px" colors={colors} />
        <SpecItem label="Title" value="Pretendard Bold 21" colors={colors} />
        <SpecItem label="Content" value="Pretendard Regular 16" colors={colors} />
        <SpecItem label="Button Height" value="48px" colors={colors} />
        <SpecItem label="Animation" value="Scale + Fade" colors={colors} />
        <SpecItem label="Structure" value="Flexible (children prop)" colors={colors} />
      </View>
    </>
  );
}

/**
 * TopNav Content
 */
function TopNavContent({ colors }: { colors: ColorPalette }) {
  const [periodType, setPeriodType] = useState<'year' | 'month'>('month');
  
  // Get current date
  const getCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // getMonth() returns 0-11, so +1 for 1-12
    return { year, month };
  };
  
  const currentDate = getCurrentDate();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.month);

  const monthOptions = [
    { label: '1월', value: 1 },
    { label: '2월', value: 2 },
    { label: '3월', value: 3 },
    { label: '4월', value: 4 },
    { label: '5월', value: 5 },
    { label: '6월', value: 6 },
    { label: '7월', value: 7 },
    { label: '8월', value: 8 },
    { label: '9월', value: 9 },
    { label: '10월', value: 10 },
    { label: '11월', value: 11 },
    { label: '12월', value: 12 },
  ];

  return (
    <>
      {/* 1. Main - Basic (메뉴명만) */}
      <SectionHeader title="Main - 메뉴명" colors={colors} />
      <TopNavigation
        type="main"
        title="메뉴명"
      />

      {/* 2. Main - With Day (날짜 표시 + 월 선택 Picker) */}
      <SectionHeader title="Main - 날짜 표시 (클릭하면 월 선택)" colors={colors} />
      <TopNavigation
        type="main"
        title="메뉴명"
        showDay
        dateText={`${currentDate.year}/${selectedMonth.toString().padStart(2, '0')}`}
        showDropdownArrow
        monthOptions={monthOptions}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        periodType={periodType}
        onPeriodChange={setPeriodType}
      />

      {/* 3. Sub - Title Only (타이틀만) */}
      <SectionHeader title="Sub - 타이틀만 (중앙 정렬)" colors={colors} />
      <TopNavigation
        type="sub"
        title="타이틀"
      />

      {/* 4. Sub - With Back & Button (타이틀 + 뒤로 + 버튼) */}
      <SectionHeader title="Sub - 타이틀 + 뒤로 + 버튼" colors={colors} />
      <TopNavigation
        type="sub"
        title="타이틀"
        showLeftIcon
        onLeftIconPress={() => {}}
        showRightButton
        rightButtonText="확인"
        onRightButtonPress={() => {}}
      />

      {/* 5. Sub - With Back Only (타이틀 + 뒤로) */}
      <SectionHeader title="Sub - 타이틀 + 뒤로" colors={colors} />
      <TopNavigation
        type="sub"
        title="타이틀"
        showLeftIcon
        onLeftIconPress={() => {}}
      />

      {/* 6. Sub - With Day (날짜 + 뒤로 + 월 선택) */}
      <SectionHeader title="Sub - 날짜 + 뒤로 (클릭하면 월 선택)" colors={colors} />
      <TopNavigation
        type="sub"
        title="타이틀"
        showLeftIcon
        onLeftIconPress={() => {}}
        showDay
        dateText={`${currentDate.year}년 ${selectedMonth}월`}
        showDropdownArrow
        monthOptions={monthOptions}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
      />

      {/* TopNav Specs */}
      <SectionHeader title="TopNav Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Height" value="56px" colors={colors} />
        <SpecItem label="Divider Height" value="1px" colors={colors} />
        <SpecItem label="Main Title" value="Pretendard Bold 21" colors={colors} />
        <SpecItem label="Sub Title" value="Pretendard Bold 16" colors={colors} />
        <SpecItem label="Button Height" value="32px" colors={colors} />
        <SpecItem label="Period Toggle" value="42×32px" colors={colors} />
      </View>
    </>
  );
}

/**
 * Bottomsheets Content
 */
function BottomsheetsContent({ colors }: { colors: ColorPalette }) {
  const [showBasicSheet, setShowBasicSheet] = useState(false);
  const [showWithConfirm, setShowWithConfirm] = useState(false);
  const [showCustomContent, setShowCustomContent] = useState(false);

  return (
    <>
      {/* Basic Bottomsheet */}
      <SectionHeader title="Basic Bottomsheet" colors={colors} />
      <Button
        variant="primary"
        size="large"
        onPress={() => setShowBasicSheet(true)}
      >
        기본 Bottomsheet 열기
      </Button>
      <ModalBottomsheet
        visible={showBasicSheet}
        title="타이틀"
        onClose={() => setShowBasicSheet(false)}
      >
        <Text style={[typography.body01.regular, { color: colors.text }]}>
          이것은 기본 Bottomsheet입니다.{'\n'}
          닫기 버튼으로 닫을 수 있습니다.
        </Text>
      </ModalBottomsheet>

      {/* Bottomsheet with Confirm */}
      <SectionHeader title="Bottomsheet - 확인 버튼" colors={colors} />
      <Button
        variant="primary"
        size="large"
        onPress={() => setShowWithConfirm(true)}
      >
        확인 버튼 Bottomsheet 열기
      </Button>
      <ModalBottomsheet
        visible={showWithConfirm}
        title="기록/챌린지"
        confirmText="확인"
        onConfirm={() => {

          setShowWithConfirm(false);
        }}
        onClose={() => setShowWithConfirm(false)}
      >
        <Text style={[typography.body01.regular, { color: colors.text, marginBottom: 16 }]}>
          확인 버튼이 있는 Bottomsheet입니다.
        </Text>
        <Text style={[typography.body02.regular, { color: colors.textNeutral }]}>
          우측 상단의 확인 버튼을 눌러보세요.
        </Text>
      </ModalBottomsheet>

      {/* Custom Content Example */}
      <SectionHeader title="Custom Content - 리스트 예시" colors={colors} />
      <Button
        variant="primary"
        size="large"
        onPress={() => setShowCustomContent(true)}
      >
        커스텀 컨텐츠 열기
      </Button>
      <ModalBottomsheet
        visible={showCustomContent}
        title="기록/챌린지"
        confirmText="확인"
        onConfirm={() => setShowCustomContent(false)}
        onClose={() => setShowCustomContent(false)}
      >
        <View style={{ gap: 8 }}>
          {['💰 입금 기록', '💸 소비 기록', '🎯 챌린지 도전'].map((item, index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.fill,
                padding: 16,
                borderRadius: 16,
                minHeight: 56,
              }}
            >
              <Text style={[typography.body01.regular, { color: colors.text }]}>
                {item}
              </Text>
              <Text style={[typography.body01.regular, { color: colors.textNeutral }]}>
                1일
              </Text>
            </View>
          ))}
        </View>
      </ModalBottomsheet>

      {/* Bottomsheet Specs */}
      <SectionHeader title="Bottomsheet Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Width" value="전체 화면 (375px)" colors={colors} />
        <SpecItem label="Border Radius" value="16px (상단만)" colors={colors} />
        <SpecItem label="Max Height" value="90% of screen" colors={colors} />
        <SpecItem label="Navigation Height" value="56px" colors={colors} />
        <SpecItem label="Animation" value="Slide up from bottom" colors={colors} />
        <SpecItem label="Backdrop" value="Dim (like native picker)" colors={colors} />
        <SpecItem label="Structure" value="Flexible (children prop)" colors={colors} />
      </View>
    </>
  );
}

/**
 * Tags Content
 */
function TagsContent({ colors }: { colors: ColorPalette }) {
  const [selectedTag, setSelectedTag] = useState<string>('전체');

  return (
    <>
      {/* Tag - Default */}
      <SectionHeader title="Tag - Default" colors={colors} />
      <Tag label="텍스트" />

      {/* Tag - Active */}
      <SectionHeader title="Tag - Active" colors={colors} />
      <Tag label="텍스트" />

      {/* Interactive Single Selection */}
      <SectionHeader title="Interactive - Single Selection" colors={colors} />
      <View style={styles.tagRow}>
        {['전체', '입금', '출금', '저축'].map((tag) => (
          <Chip
            key={tag}
            label={tag}
            active={selectedTag === tag}
            onPress={() => setSelectedTag(tag)}
          />
        ))}
      </View>

      {/* Tag Specs */}
      <SectionHeader title="Tag Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Height" value="37px" colors={colors} />
        <SpecItem label="Padding H" value="16px" colors={colors} />
        <SpecItem label="Padding V" value="8px" colors={colors} />
        <SpecItem label="Border Radius" value="24px (캡슐)" colors={colors} />
        <SpecItem label="Text (Active)" value="Pretendard Bold 14" colors={colors} />
        <SpecItem label="Text (Default)" value="Pretendard Medium 14" colors={colors} />
        <SpecItem label="Color (Active)" value="Primary Blue" colors={colors} />
        <SpecItem label="Color (Default)" value="White + Gray Border" colors={colors} />
      </View>
    </>
  );
}

/**
 * Calendars Content
 */
function CalendarsContent({ colors }: { colors: ColorPalette }) {
  const [selectedDate, setSelectedDate] = useState('2025-10-16');

  // Sample data - 입금/소비 금액
  const sampleData: Record<string, { totalIncome?: number; totalExpense?: number }> = {
    '2025-10-01': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-02': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-03': { totalIncome: 5000000, totalExpense: 12800 },
    '2025-10-04': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-05': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-06': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-07': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-08': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-09': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-10': { totalIncome: 5000000, totalExpense: 12800 },
    '2025-10-11': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-12': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-13': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-14': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-15': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-16': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-17': { totalIncome: 5000000, totalExpense: 12800 },
    '2025-10-18': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-19': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-20': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-21': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-22': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-23': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-24': { totalIncome: 5000000, totalExpense: 12800 },
    '2025-10-25': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-26': { totalIncome: 0, totalExpense: 12800 },
    '2025-10-27': { totalIncome: 0, totalExpense: 12800 },
  };

  return (
    <>
      {/* Calendar Main */}
      <SectionHeader title="Calendar - 입금/소비 표시 (스와이프 가능)" colors={colors} />
      <View style={{ marginHorizontal: -20 }}>
        <CalendarMain
          selectedDate={selectedDate}
          onDayPress={(dateString) => setSelectedDate(dateString)}
          dayData={sampleData}
          onMonthChange={(year, month) => {

          }}
        />
      </View>

      {/* Selected Date Info */}
      <View style={[styles.specsContainer, { backgroundColor: colors.fill, marginTop: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[typography.body02.medium, { color: colors.textNeutral }]}>
            선택된 날짜
          </Text>
          <Text style={[typography.body02.bold, { color: colors.text }]}>
            {selectedDate}
          </Text>
        </View>
        {sampleData[selectedDate] && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[typography.body02.medium, { color: colors.textNeutral }]}>
                입금
              </Text>
              <Text style={[typography.body02.bold, { color: '#058943' }]}>
                {sampleData[selectedDate].totalIncome?.toLocaleString() || 0}원
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[typography.body02.medium, { color: colors.textNeutral }]}>
                소비
              </Text>
              <Text style={[typography.body02.bold, { color: '#ef2a2a' }]}>
                {sampleData[selectedDate].totalExpense?.toLocaleString() || 0}원
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Calendar Day Select */}
      <View style={{ marginTop: 32 }}>
        <SectionHeader title="Calendar - 날짜 선택 (스와이프 가능)" colors={colors} />
      </View>
      <View style={{ marginHorizontal: -20 }}>
        <CalendarDaySelect
          selectedDate={selectedDate}
          onDayPress={(dateString) => setSelectedDate(dateString)}
          onMonthChange={(year, month) => {

          }}
        />
      </View>

      {/* Calendar Specs */}
      <SectionHeader title="Calendar Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Day Cell" value="54×90px" colors={colors} />
        <SpecItem label="Day Number" value="32×32px, 16px Bold" colors={colors} />
        <SpecItem label="Day Header" value="40px height, 12px Medium" colors={colors} />
        <SpecItem label="Income Color" value="#058943 (Green)" colors={colors} />
        <SpecItem label="Expense Color" value="#ef2a2a (Red)" colors={colors} />
        <SpecItem label="Selected" value="Primary Blue background" colors={colors} />
        <SpecItem label="Amount Text" value="10px Regular" colors={colors} />
        <SpecItem label="Library" value="react-native-calendars" colors={colors} />
      </View>
    </>
  );
}

/**
 * Tabs Content
 */
function TabsContent({ colors }: { colors: ColorPalette }) {
  const [twoTab, setTwoTab] = useState('income');
  const [threeTab, setThreeTab] = useState('monthly');
  const [fourTab, setFourTab] = useState('all');
  const [fiveTab, setFiveTab] = useState('all');
  const [sixTab, setSixTab] = useState('food');
  const [sevenTab, setSevenTab] = useState('account');
  const [eightTab, setEightTab] = useState('food');

  const twoTabs = [
    { label: '수입', value: 'income' },
    { label: '지출', value: 'expense' },
  ];

  const threeTabs = [
    { label: '일별', value: 'daily' },
    { label: '주별', value: 'weekly' },
    { label: '월별', value: 'monthly' },
  ];

  const fourTabs = [
    { label: '전체', value: 'all' },
    { label: '수입', value: 'income' },
    { label: '지출', value: 'expense' },
    { label: '이체', value: 'transfer' },
  ];

  const fiveTabs = [
    { label: '전체', value: 'all' },
    { label: '식비', value: 'food' },
    { label: '교통비', value: 'transport' },
    { label: '쇼핑', value: 'shopping' },
    { label: '기타', value: 'other' },
  ];

  const sixTabs = [
    { label: '식비', value: 'food' },
    { label: '교통비', value: 'transport' },
    { label: '쇼핑', value: 'shopping' },
    { label: '문화생활', value: 'culture' },
    { label: '의료/건강', value: 'health' },
    { label: '기타', value: 'other' },
  ];

  const sevenTabs = [
    { label: '계좌', value: 'account' },
    { label: '카드', value: 'card' },
    { label: '현금', value: 'cash' },
    { label: '페이', value: 'pay' },
    { label: '상품권', value: 'voucher' },
    { label: '포인트', value: 'point' },
    { label: '기타', value: 'other' },
  ];

  const eightTabs = [
    { label: '식비', value: 'food' },
    { label: '교통비', value: 'transport' },
    { label: '쇼핑', value: 'shopping' },
    { label: '문화생활', value: 'culture' },
    { label: '의료/건강', value: 'health' },
    { label: '교육', value: 'education' },
    { label: '주거/관리', value: 'housing' },
    { label: '기타', value: 'other' },
  ];

  return (
    <>
      <SectionHeader title="2개 탭 (균등 분할)" colors={colors} />
      <Tab
        options={twoTabs}
        value={twoTab}
        onValueChange={setTwoTab}
      />
      <View style={[styles.tabPreview, { backgroundColor: colors.fill }]}>
        <Text style={[typography.body02.regular, { color: colors.text }]}>
          선택: <Text style={{ fontWeight: '700' }}>{twoTabs.find(t => t.value === twoTab)?.label}</Text>
        </Text>
      </View>

      <SectionHeader title="3개 탭 (균등 분할)" colors={colors} />
      <Tab
        options={threeTabs}
        value={threeTab}
        onValueChange={setThreeTab}
      />
      <View style={[styles.tabPreview, { backgroundColor: colors.fill }]}>
        <Text style={[typography.body02.regular, { color: colors.text }]}>
          선택: <Text style={{ fontWeight: '700' }}>{threeTabs.find(t => t.value === threeTab)?.label}</Text>
        </Text>
      </View>

      <SectionHeader title="4개 탭 (균등 분할)" colors={colors} />
      <Tab
        options={fourTabs}
        value={fourTab}
        onValueChange={setFourTab}
      />
      <View style={[styles.tabPreview, { backgroundColor: colors.fill }]}>
        <Text style={[typography.body02.regular, { color: colors.text }]}>
          선택: <Text style={{ fontWeight: '700' }}>{fourTabs.find(t => t.value === fourTab)?.label}</Text>
        </Text>
      </View>

      <SectionHeader title="5개 탭 (화면 꽉 채움 or 스크롤)" colors={colors} />
      <Tab
        options={fiveTabs}
        value={fiveTab}
        onValueChange={setFiveTab}
      />
      <View style={[styles.tabPreview, { backgroundColor: colors.fill }]}>
        <Text style={[typography.body02.regular, { color: colors.text }]}>
          선택: <Text style={{ fontWeight: '700' }}>{fiveTabs.find(t => t.value === fiveTab)?.label}</Text>
        </Text>
      </View>

      <SectionHeader title="6개 탭 (스크롤 가능)" colors={colors} />
      <Tab
        options={sixTabs}
        value={sixTab}
        onValueChange={setSixTab}
        scrollable
      />
      <View style={[styles.tabPreview, { backgroundColor: colors.fill }]}>
        <Text style={[typography.body02.regular, { color: colors.text }]}>
          선택: <Text style={{ fontWeight: '700' }}>{sixTabs.find(t => t.value === sixTab)?.label}</Text>
        </Text>
      </View>

      <SectionHeader title="7개 탭 (스크롤 가능)" colors={colors} />
      <Tab
        options={sevenTabs}
        value={sevenTab}
        onValueChange={setSevenTab}
        scrollable
      />
      <View style={[styles.tabPreview, { backgroundColor: colors.fill }]}>
        <Text style={[typography.body02.regular, { color: colors.text }]}>
          선택: <Text style={{ fontWeight: '700' }}>{sevenTabs.find(t => t.value === sevenTab)?.label}</Text>
        </Text>
      </View>

      <SectionHeader title="8개 탭 (스크롤 가능)" colors={colors} />
      <Tab
        options={eightTabs}
        value={eightTab}
        onValueChange={setEightTab}
        scrollable
      />
      <View style={[styles.tabPreview, { backgroundColor: colors.fill }]}>
        <Text style={[typography.body02.regular, { color: colors.text }]}>
          선택: <Text style={{ fontWeight: '700' }}>{eightTabs.find(t => t.value === eightTab)?.label}</Text>
        </Text>
      </View>
    </>
  );
}

/**
 * Section Header Component
 */
function SectionHeader({
  title,
  colors,
}: {
  title: string;
  colors: ColorPalette;
}) {
  return (
    <Text
      style={[typography.headline03.bold, { color: colors.text, marginTop: 24, marginBottom: 12 }]}
    >
      {title}
    </Text>
  );
}

/**
 * Spec Item Component
 */
function SpecItem({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.specItem}>
      <Text style={[typography.body02.regular, { color: colors.textNeutral }]}>{label}</Text>
      <Text style={[typography.body02.bold, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  tabWrapper: {
    // No padding - Tab component handles internal padding
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 0,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  column: {
    gap: 12,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 24,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabPreview: {
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  specsContainer: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 12,
  },
  // Test Section
  section: {
    gap: 8,
  },
  testButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
    ...typography.body02.medium,
  },
  testButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  testButtonSmall: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonSmallText: {
    ...typography.detail.bold,
  },
  infoBox: {
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  infoText: {
    ...typography.body02.regular,
  },
  switchLabel: {
    ...typographyLayout.fieldLine,
  },
  // Developer Mode Container
  devModeContainer: {
    padding: 16,
    borderRadius: 12,
  },
  devModeSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Date Adjustment
  dateButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  dateButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  dateButtonText: {
    ...typography.detail.bold,
    marginBottom: 2,
  },
  dateButtonSubText: {
    ...typography.detail.regular,
  },
  restoreButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  restoreButtonText: {
    ...typography.detail.bold,
  },
  deleteButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  deleteButtonText: {
    ...typography.body02.bold,
  },
  specItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

