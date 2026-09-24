/**
 * Notification Scheduler
 * 
 * Manages scheduled notifications with proper permission checks
 * Implements all push message policies
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as ExpoNotifications from 'expo-notifications';

import { getExpoNotifications } from '@/utils/expo-notifications-client';

import { parseCalendarDataFromJson } from '@/utils/calendar-data-parse';
import type { CalendarData, CalendarDayData, CalendarRecord } from '@/utils/consumption-index';
import {
  buildSmsInboxReminderBody,
  decideEveningGeneralPush,
  getClosedJudgmentWindowForSmsBuffer,
  getJudgmentWindowForNow,
  type EveningPushWindow,
} from '@/utils/evening-general-push-policy';
import { getAllExpenses } from '@/utils/expenses';
import {
  getSmsInboxPushWindowStats,
  recordSmsInboxPushReceived,
} from '@/utils/sms-inbox-push-ledger';

type NotificationRequest = ExpoNotifications.NotificationRequest;
type NotificationContentData = ExpoNotifications.NotificationContent['data'];

type CalendarDayBucket = CalendarDayData & { totalExpense?: number };

type ExpenseActivityRecord = CalendarRecord & {
  isRefunded?: boolean;
  isSettled?: boolean;
};

function calendarDataHasCategoryExpense(calendarData: CalendarData, category: string): boolean {
  for (const dateData of Object.values(calendarData)) {
    if (!dateData?.records?.length) {
      continue;
    }
    const found = dateData.records.some(
      (record) => record.type === 'expense' && record.category === category,
    );
    if (found) {
      return true;
    }
  }
  return false;
}

export const GENERAL_NOTIFICATIONS_ENABLED_KEY = 'generalNotificationsEnabled';
export const CHALLENGE_NOTIFICATIONS_ENABLED_KEY = 'challengeNotificationsEnabled';
const DAILY_REMINDER_TITLE = '오늘은 어떤 소비들을 하셨나요?';
const DAILY_REMINDER_BODY = '시작이 반! 소비 기록을 통해 차근차근 소비습관을 개선해 보세요!';
const SMS_INBOX_REMINDER_TITLE = '소비 기록 수신 현황';
const DAILY_EXPENSE_REMINDER_ID = 'daily_expense_reminder';
const DAILY_SMS_INBOX_REMINDER_ID = 'daily_sms_inbox_reminder';
const EXPENSE_REMINDER_TYPE = 'expense_reminder';
const SMS_INBOX_REMINDER_TYPE = 'sms_inbox_reminder';
let dailyReminderOperationQueue: Promise<void> = Promise.resolve();

function runDailyReminderExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = dailyReminderOperationQueue.then(operation, operation);
  dailyReminderOperationQueue = nextOperation.then(
    () => undefined,
    () => undefined
  );
  return nextOperation;
}

/**
 * Check only system permission.
 * Feature ON/OFF 판단은 general/challenge 분기 키에서 처리한다.
 */
async function shouldSendNotification(): Promise<boolean> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return false;
    }
    // Check system permission
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

async function getLegacyNotificationsEnabled(): Promise<boolean> {
  const legacy = await AsyncStorage.getItem('notificationsEnabled');
  if (legacy === null) return true;
  return legacy === 'true';
}

export async function getGeneralNotificationsEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(GENERAL_NOTIFICATIONS_ENABLED_KEY);
  if (stored === null) {
    const fallback = await getLegacyNotificationsEnabled();
    await AsyncStorage.setItem(GENERAL_NOTIFICATIONS_ENABLED_KEY, JSON.stringify(fallback));
    return fallback;
  }
  return stored === 'true';
}

export async function getChallengeNotificationsEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(CHALLENGE_NOTIFICATIONS_ENABLED_KEY);
  if (stored === null) {
    const fallback = await getLegacyNotificationsEnabled();
    await AsyncStorage.setItem(CHALLENGE_NOTIFICATIONS_ENABLED_KEY, JSON.stringify(fallback));
    return fallback;
  }
  return stored === 'true';
}

async function shouldSendGeneralNotification(): Promise<boolean> {
  const isEnabled = await getGeneralNotificationsEnabled();
  if (!isEnabled) {
    return false;
  }
  return shouldSendNotification();
}

async function shouldSendChallengeNotification(): Promise<boolean> {
  const isEnabled = await getChallengeNotificationsEnabled();
  if (!isEnabled) {
    return false;
  }
  return shouldSendNotification();
}

async function cancelScheduledNotificationsByTypes(types: string[]): Promise<void> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduledNotifications) {
    const notificationType = notification.content.data?.type;
    if (typeof notificationType === 'string' && types.includes(notificationType)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      } catch {
        // ignore cancellation failures for missing/stale identifiers
      }
    }
  }
}

function getNotificationDataString(
  data: NotificationContentData,
  key: string,
): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function cancelScheduledNotificationByIdentifier(identifier: string): Promise<void> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {
    // 이미 OS에서 제거된 식별자는 무시합니다.
  });
}

function challengeSuccessNotificationIdentifier(challengeId: string): string {
  return `challenge_success_${challengeId}`;
}

function challengeFailureNotificationIdentifier(challengeId: string): string {
  return `challenge_failure_${challengeId}`;
}

/** 종료일 다음날 09:30. iOS는 과거 DATE 트리거 시 UNNotificationTrigger assertion 실패. */
function getChallengeOutcomeNotificationDate(endDate: Date): Date | null {
  if (!Number.isFinite(endDate.getTime())) {
    return null;
  }

  const notificationDate = new Date(endDate);
  notificationDate.setDate(notificationDate.getDate() + 1);
  notificationDate.setHours(9, 30, 0, 0);

  if (!Number.isFinite(notificationDate.getTime())) {
    return null;
  }

  if (notificationDate.getTime() <= Date.now()) {
    return null;
  }

  return notificationDate;
}

/** 스케줄 불가(과거·무효) 시 재시도 방지용 마킹 */
async function markChallengeOutcomeNotificationHandled(storageKey: string): Promise<void> {
  await AsyncStorage.setItem(storageKey, 'true');
}

function isGeneralReminderNotification(notification: NotificationRequest): boolean {
  const notificationType = notification.content.data?.type;
  return (
    notification.identifier === DAILY_EXPENSE_REMINDER_ID ||
    notificationType === EXPENSE_REMINDER_TYPE ||
    (notification.content.title === DAILY_REMINDER_TITLE &&
      notification.content.body === DAILY_REMINDER_BODY)
  );
}

function isSmsInboxReminderNotification(notification: NotificationRequest): boolean {
  const notificationType = notification.content.data?.type;
  return (
    notification.identifier === DAILY_SMS_INBOX_REMINDER_ID ||
    notificationType === SMS_INBOX_REMINDER_TYPE ||
    notification.content.title === SMS_INBOX_REMINDER_TITLE
  );
}

async function getGeneralReminderNotifications(): Promise<NotificationRequest[]> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return [];
  }
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  return scheduledNotifications.filter(isGeneralReminderNotification);
}

async function getSmsInboxReminderNotifications(): Promise<NotificationRequest[]> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return [];
  }
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  return scheduledNotifications.filter(isSmsInboxReminderNotification);
}

async function dedupeGeneralReminderNotifications(): Promise<void> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  const generalNotifications = await getGeneralReminderNotifications();
  if (generalNotifications.length <= 1) {
    return;
  }

  // Keep the first notification and cancel the rest.
  for (let index = 1; index < generalNotifications.length; index += 1) {
    await Notifications.cancelScheduledNotificationAsync(generalNotifications[index].identifier).catch(() => {});
  }
}

async function dedupeSmsInboxReminderNotifications(): Promise<void> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  const notifications = await getSmsInboxReminderNotifications();
  if (notifications.length <= 1) {
    return;
  }
  for (let index = 1; index < notifications.length; index += 1) {
    await Notifications.cancelScheduledNotificationAsync(notifications[index].identifier).catch(() => {});
  }
}

async function cancelGeneralReminderNotifications(): Promise<void> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  // 1) Known fixed identifier cancellation
  await Notifications.cancelScheduledNotificationAsync(DAILY_EXPENSE_REMINDER_ID).catch(() => {});

  // 2) Defensive cleanup for legacy or orphan reminder schedules by type
  await cancelScheduledNotificationsByTypes([EXPENSE_REMINDER_TYPE]);

  // 3) Additional defensive cleanup:
  // some legacy requests may not have the expected identifier/data.type.
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduledNotifications) {
    if (isGeneralReminderNotification(notification)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      } catch {
        // ignore cancellation failures for missing/stale identifiers
      }
    }
  }

  // 4) Final retry once if anything still remains after cancellation
  const remainingGeneralReminders = await getGeneralReminderNotifications();

  if (remainingGeneralReminders.length > 0) {
    for (const notification of remainingGeneralReminders) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => {});
    }
  }
}

async function cancelSmsInboxReminderNotifications(): Promise<void> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(DAILY_SMS_INBOX_REMINDER_ID).catch(() => {});
  await cancelScheduledNotificationsByTypes([SMS_INBOX_REMINDER_TYPE]);

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduledNotifications) {
    if (isSmsInboxReminderNotification(notification)) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => {});
    }
  }

  const remaining = await getSmsInboxReminderNotifications();
  for (const notification of remaining) {
    await Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => {});
  }
}

async function cancelEveningGeneralPushNotifications(): Promise<void> {
  await cancelGeneralReminderNotifications();
  await cancelSmsInboxReminderNotifications();
}

export async function setGeneralNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(GENERAL_NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));
  if (!enabled) {
    await cancelDailyReminder();
    return;
  }
  await setupDailyReminder();
}

export async function setChallengeNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CHALLENGE_NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));
  if (!enabled) {
    await cancelScheduledNotificationsByTypes(['challenge_progress', 'challenge_success', 'challenge_failure']);
    const keys = await AsyncStorage.getAllKeys();
    const challengeMarkKeys = keys.filter(
      (key) =>
        key.startsWith('challenge_progress_') ||
        key.startsWith('challenge_success_') ||
        key.startsWith('challenge_failure_')
    );
    if (challengeMarkKeys.length > 0) {
      await AsyncStorage.multiRemove(challengeMarkKeys);
    }
  }
}

/**
 * 해당 날짜 버킷에 일반 리마인드를 보내지 않아도 될 만큼의 지출 기록 활동이 있는지 판단합니다.
 * - 금액이 남은 지출, 또는 환불/결산 처리로 금액은 0이어도 사용자가 기록·후속 조치를 한 경우 포함
 * - totalExpense > 0 은 records 합계와 어긋날 때를 위한 보조 조건
 */
function calendarDayHasExpenseActivity(dayData: CalendarDayBucket | undefined): boolean {
  if (!dayData) {
    return false;
  }

  if (typeof dayData.totalExpense === 'number' && dayData.totalExpense > 0) {
    return true;
  }

  const { records } = dayData;
  if (!records?.length) {
    return false;
  }

  return records.some((record: ExpenseActivityRecord) => {
    if (record.type !== 'expense') {
      return false;
    }
    if (record.isDeleted === true) {
      return false;
    }
    const amount = typeof record.amount === 'number' ? record.amount : 0;
    if (amount > 0) {
      return true;
    }
    if (record.isRefunded === true) {
      return true;
    }
    if (record.isSettled === true) {
      return true;
    }
    return false;
  });
}

function localDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `YYYY-MM-DD HH:mm:ss` 또는 ISO 문자열 등 `Date.parse` 가능한 값 */
function localDateKeyFromStoredDateTime(value: string): string | null {
  const t = Date.parse(value);
  if (Number.isNaN(t)) {
    return null;
  }
  return localDateKeyFromMs(t);
}

/**
 * expenseData 기준, 로컬 달력 "오늘"에 생성된 지출이 있는지 (삭제 제외).
 * 날짜만 과거/미래로 옮긴 경우에도 오늘 생성이면 true.
 */
async function hasExpenseCreatedLocalToday(): Promise<boolean> {
  try {
    const expenses = await getAllExpenses();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return expenses.some((e) => {
      if (e.isDeleted) {
        return false;
      }
      if (typeof e.createdAt === 'string' && e.createdAt.length > 0) {
        const key = localDateKeyFromStoredDateTime(e.createdAt);
        if (key !== null && key === todayKey) {
          return true;
        }
      }
      return localDateKeyFromMs(e.timestamp) === todayKey;
    });
  } catch {
    return false;
  }
}

/**
 * 오늘(로컬) 날짜 키 기준으로 지출 기록 활동이 있는지 확인합니다.
 * 캘린더 버킷 활동 또는 오늘(로컬) 생성된 지출(expenseData) 중 하나라도 해당하면 true.
 */
async function hasExpenseToday(): Promise<boolean> {
  try {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const calendarRaw = await AsyncStorage.getItem('calendarData');
    if (calendarRaw) {
      const calendarData = parseCalendarDataFromJson(calendarRaw);
      if (calendarDayHasExpenseActivity(calendarData[dateKey])) {
        return true;
      }
    }

    return await hasExpenseCreatedLocalToday();
  } catch {
    return false;
  }
}

function parseExpenseCreatedAtMs(value: string): number | null {
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) {
    return direct;
  }
  // `YYYY-MM-DD HH:mm:ss` — 일부 JS 엔진에서 Date.parse 실패
  const isoish = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(isoish) ? null : isoish;
}

function expenseCreatedAtMs(expense: {
  isDeleted?: boolean;
  createdAt?: string;
  timestamp: number;
}): number | null {
  if (expense.isDeleted) {
    return null;
  }
  if (typeof expense.createdAt === 'string' && expense.createdAt.length > 0) {
    const parsed = parseExpenseCreatedAtMs(expense.createdAt);
    if (parsed != null) {
      return parsed;
    }
  }
  if (typeof expense.timestamp === 'number' && Number.isFinite(expense.timestamp)) {
    return expense.timestamp;
  }
  return null;
}

async function hasExpenseCreatedInWindow(window: EveningPushWindow): Promise<boolean> {
  try {
    const expenses = await getAllExpenses();
    return expenses.some((expense) => {
      const createdAtMs = expenseCreatedAtMs(expense);
      if (createdAtMs == null) {
        return false;
      }
      return createdAtMs >= window.startMs && createdAtMs < window.endMs;
    });
  } catch {
    return false;
  }
}

/** 업그레이드 전 수신함 잔여 건을 원장에 보강 (동적 import로 store 순환 참조 방지) */
async function hydrateSmsInboxPushLedgerFromStore(): Promise<void> {
  try {
    const { loadSmsInboxItems } = await import('@/utils/sms-inbox-store');
    const items = await loadSmsInboxItems();
    for (const item of items) {
      const receivedAtMs = Date.parse(item.createdAt);
      await recordSmsInboxPushReceived(
        item.id,
        Number.isNaN(receivedAtMs) ? Date.now() : receivedAtMs,
      );
    }
  } catch {
    // ignore hydrate failures
  }
}

async function resolveEveningPushDecision(nowMs: number): Promise<{
  window: EveningPushWindow;
  kind: ReturnType<typeof decideEveningGeneralPush>['kind'];
  smsCount: number;
  hasExpenseCreatedInWindow: boolean;
  smsReceivedCount: number;
  smsUnconvertedCount: number;
}> {
  const closedForSmsBuffer = getClosedJudgmentWindowForSmsBuffer(nowMs);
  const window = closedForSmsBuffer ?? getJudgmentWindowForNow(nowMs);
  await hydrateSmsInboxPushLedgerFromStore();
  const [hasExpense, smsStats] = await Promise.all([
    hasExpenseCreatedInWindow(window),
    getSmsInboxPushWindowStats(window.startMs, window.endMs),
  ]);
  const decision = decideEveningGeneralPush({
    nowMs,
    hasExpenseCreatedInWindow: hasExpense,
    smsReceivedCount: smsStats.receivedCount,
    smsUnconvertedCount: smsStats.unconvertedCount,
  });
  return {
    window,
    kind: decision.kind,
    smsCount: decision.smsCount,
    hasExpenseCreatedInWindow: hasExpense,
    smsReceivedCount: smsStats.receivedCount,
    smsUnconvertedCount: smsStats.unconvertedCount,
  };
}

function getTodayAt(hours: number, minutes: number, fromMs: number = Date.now()): Date {
  const date = new Date(fromMs);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** 개발·테스트용: 일반(소비 유도·가기록) 알림 스케줄 판단에 쓰이는 상태 */
export type DailyReminderDebugSnapshot = {
  generalEnabled: boolean;
  permissionGranted: boolean;
  hasExpenseToday: boolean;
  hasExpenseCreatedInWindow: boolean;
  smsReceivedCount: number;
  smsUnconvertedCount: number;
  decisionKind: string;
  todayScheduleMarkPresent: boolean;
  /** 설정 ON + 권한 + 판정 결과 예약 대상 */
  wouldSchedule: boolean;
};

export async function getDailyReminderDebugSnapshot(): Promise<DailyReminderDebugSnapshot> {
  const nowMs = Date.now();
  const [generalEnabled, permissionGranted, hasExpense, resolved] = await Promise.all([
    getGeneralNotificationsEnabled(),
    shouldSendNotification(),
    hasExpenseToday(),
    resolveEveningPushDecision(nowMs),
  ]);
  const today = new Date().toDateString();
  const mark = await AsyncStorage.getItem(`daily_reminder_${today}`);
  const settingsAndPermissionOk = generalEnabled && permissionGranted;

  return {
    generalEnabled,
    permissionGranted,
    hasExpenseToday: hasExpense,
    hasExpenseCreatedInWindow: resolved.hasExpenseCreatedInWindow,
    smsReceivedCount: resolved.smsReceivedCount,
    smsUnconvertedCount: resolved.smsUnconvertedCount,
    decisionKind: resolved.kind,
    todayScheduleMarkPresent: mark === 'true',
    wouldSchedule: settingsAndPermissionOk && resolved.kind !== 'none',
  };
}

/**
 * 저녁 일반 푸시 동기화
 * - 소비 기록 유도: 매일 20:00, 판정 구간 내 소비·가기록 모두 없을 때
 * - 문자 가기록 생성 유도: 매일 20:05, 구간 내 미전환 가기록 ≥ 1
 */
export async function setupDailyReminder(): Promise<void> {
  return runDailyReminderExclusive(async () => {
    await setupDailyReminderInternal();
  });
}

async function setupDailyReminderInternal(): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    await cancelDailyReminderInternal();

    if (!(await shouldSendGeneralNotification())) {
      return;
    }

    const nowMs = Date.now();
    const today2005 = getTodayAt(20, 5, nowMs);
    const resolved = await resolveEveningPushDecision(nowMs);
    const today = new Date(nowMs).toDateString();
    const scheduledKey = `daily_reminder_${today}`;

    if (resolved.kind === 'expense_reminder') {
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_EXPENSE_REMINDER_ID,
        content: {
          title: DAILY_REMINDER_TITLE,
          body: DAILY_REMINDER_BODY,
          data: { type: EXPENSE_REMINDER_TYPE },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 20,
          minute: 0,
        },
      });
    } else if (resolved.kind === 'sms_inbox_reminder') {
      const body = buildSmsInboxReminderBody(resolved.smsCount);
      if (nowMs < today2005.getTime()) {
        await Notifications.scheduleNotificationAsync({
          identifier: DAILY_SMS_INBOX_REMINDER_ID,
          content: {
            title: SMS_INBOX_REMINDER_TITLE,
            body,
            data: { type: SMS_INBOX_REMINDER_TYPE, count: resolved.smsCount },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: today2005,
          },
        });
      } else {
        await Notifications.scheduleNotificationAsync({
          identifier: DAILY_SMS_INBOX_REMINDER_ID,
          content: {
            title: SMS_INBOX_REMINDER_TITLE,
            body,
            data: { type: SMS_INBOX_REMINDER_TYPE, count: resolved.smsCount },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 20,
            minute: 5,
          },
        });
      }
    } else {
      return;
    }

    if (!(await shouldSendGeneralNotification())) {
      await cancelEveningGeneralPushNotifications();
      await AsyncStorage.removeItem(scheduledKey);
      return;
    }

    await dedupeGeneralReminderNotifications();
    await dedupeSmsInboxReminderNotifications();
    await AsyncStorage.setItem(scheduledKey, 'true');
  } catch {
    // ignore schedule failures
  }
}

/**
 * 소비 기록 저장·설정 OFF 등에서 저녁 일반 푸시 취소
 */
export async function cancelDailyReminder(): Promise<void> {
  return runDailyReminderExclusive(async () => {
    await cancelDailyReminderInternal();
  });
}

async function cancelDailyReminderInternal(): Promise<void> {
  try {
    await cancelEveningGeneralPushNotifications();

    const today = new Date().toDateString();
    const scheduledKey = `daily_reminder_${today}`;
    await AsyncStorage.removeItem(scheduledKey);
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel daily reminder:', error);
  }
}

/**
 * 소비 기록 삭제·가기록 변동 후 저녁 일반 푸시 재동기화
 */
export async function rescheduleDailyReminderIfNeeded(): Promise<void> {
  return runDailyReminderExclusive(async () => {
    await rescheduleDailyReminderIfNeededInternal();
  });
}

async function rescheduleDailyReminderIfNeededInternal(): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    await cancelDailyReminderInternal();

    if (!(await shouldSendGeneralNotification())) {
      return;
    }

    const nowMs = Date.now();
    const today2005 = getTodayAt(20, 5, nowMs);
    // 20:05 이후면 당일 저녁 슬롯은 종료 — 다음날 DAILY만 setup 경로로
    if (nowMs >= today2005.getTime()) {
      await setupDailyReminderInternal();
      return;
    }

    const today20 = getTodayAt(20, 0, nowMs);
    const resolved = await resolveEveningPushDecision(nowMs);
    const today = new Date(nowMs).toDateString();
    const scheduledKey = `daily_reminder_${today}`;

    if (resolved.kind === 'expense_reminder') {
      if (nowMs >= today20.getTime()) {
        return;
      }
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_EXPENSE_REMINDER_ID,
        content: {
          title: DAILY_REMINDER_TITLE,
          body: DAILY_REMINDER_BODY,
          data: { type: EXPENSE_REMINDER_TYPE },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: today20,
        },
      });
    } else if (resolved.kind === 'sms_inbox_reminder') {
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_SMS_INBOX_REMINDER_ID,
        content: {
          title: SMS_INBOX_REMINDER_TITLE,
          body: buildSmsInboxReminderBody(resolved.smsCount),
          data: { type: SMS_INBOX_REMINDER_TYPE, count: resolved.smsCount },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: today2005,
        },
      });
    } else {
      return;
    }

    if (!(await shouldSendGeneralNotification())) {
      await cancelEveningGeneralPushNotifications();
      await AsyncStorage.removeItem(scheduledKey);
      return;
    }

    await dedupeGeneralReminderNotifications();
    await dedupeSmsInboxReminderNotifications();
    await AsyncStorage.setItem(scheduledKey, 'true');
  } catch (error) {
    console.error('[notification-scheduler] Failed to reschedule daily reminder:', error);
  }
}

/**
 * 2. 챌린지 현황 알림
 * 소비율 10%, 30%, 50%, 70%, 90% 도달 시, 해당 날짜(referenceDate) 다음날 오전 9시 30분
 * ✅ 소비 기록이 있는 경우에만 알림 스케줄링
 */
export async function notifyChallengeProgress(
  category: string,
  percentage: number,
  challengeId: string,
  milestone: number,
  referenceDate: Date,
): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    if (!(await shouldSendChallengeNotification())) {
      return;
    }

    if (percentage >= 100) {
      return;
    }

    const storedData = await AsyncStorage.getItem('calendarData');
    if (!storedData) {
      return;
    }
    const calendarData = parseCalendarDataFromJson(storedData);
    if (!calendarDataHasCategoryExpense(calendarData, category)) {
      return;
    }

    const scheduleAt = new Date(referenceDate);
    scheduleAt.setDate(scheduleAt.getDate() + 1);
    scheduleAt.setHours(9, 30, 0, 0);
    if (scheduleAt.getTime() <= Date.now()) {
      return;
    }

    const identifier = `challenge_progress_${challengeId}_${milestone}`;
    // 동일 마일스톤 재스케줄 시 payload·시각을 반드시 갱신 (alreadySent로 스킵하지 않음)
    await cancelScheduledNotificationByIdentifier(identifier);
    await AsyncStorage.removeItem(`challenge_progress_${challengeId}_${milestone}`);

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `[#${category}] 챌린지 진행현황`,
        body: `${Math.round(100 - percentage)}% 남음. 오늘은 어떤 소비를 하실 예정이신가요?`,
        data: {
          type: 'challenge_progress',
          challengeId,
          category,
          percentage,
          milestone,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduleAt,
      },
    });
  } catch (error) {
    console.error('[notification-scheduler] Failed to schedule challenge progress notification:', error);
  }
}

/**
 * 3. 챌린지 성공 알림
 * 종료일 다음날 오전 9시 30분, 소비율 ≤ 100%
 */
export async function notifyChallengeSuccess(
  category: string,
  percentage: number,
  challengeId: string,
  endDate: Date
): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    // Global check
    if (!(await shouldSendChallengeNotification())) {
      return;
    }
    
    const identifier = challengeSuccessNotificationIdentifier(challengeId);
    const alreadySent = await AsyncStorage.getItem(identifier);
    if (alreadySent) {
      return;
    }
    
    // Only send if success (≤ 100%)
    if (percentage > 100) {
      return;
    }

    const notificationDate = getChallengeOutcomeNotificationDate(endDate);
    if (!notificationDate) {
      await markChallengeOutcomeNotificationHandled(identifier);
      return;
    }

    await cancelScheduledNotificationByIdentifier(identifier);

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `[#${category}] 챌린지 성공! 🎉`,
        body: `소비율 ${Math.round(percentage)}%, 축하드려요. 이 소비패턴을 유지하기 위해 챌린지를 지속해 보세요!`,
        data: { 
          type: 'challenge_success',
          challengeId,
          percentage,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationDate,
      },
    });
    
    await AsyncStorage.setItem(identifier, 'true');
    
  } catch (error) {
    console.error('[notification-scheduler] Failed to schedule challenge success notification:', error);
  }
}

/**
 * 챌린지 성공 알림 취소
 * 특정 챌린지의 스케줄된 성공 알림을 취소하고 마킹도 제거
 */
export async function cancelChallengeSuccessNotification(challengeId: string): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    const identifier = challengeSuccessNotificationIdentifier(challengeId);
    await cancelScheduledNotificationByIdentifier(identifier);

    // identifier 미지정 시점에 잡힌 UUID 예약 정리
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    for (const notification of scheduledNotifications) {
      const notifChallengeId = getNotificationDataString(notification.content.data, 'challengeId');
      const notifType = getNotificationDataString(notification.content.data, 'type');
      if (
        notifType === 'challenge_success' &&
        notifChallengeId === challengeId
      ) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
    
    await AsyncStorage.removeItem(identifier);
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel success notification:', error);
  }
}

/**
 * 챌린지 진행현황 알림 취소
 * 특정 챌린지의 모든 진행현황 알림(10%, 30%, 50%, 70%, 90%)을 취소하고 마킹도 제거
 */
/**
 * 동일 카테고리 진행 알림 전부 취소 (challengeId 변경·복원 후 잔여 OS 예약 정리)
 */
export async function cancelChallengeProgressNotificationsByCategory(
  category: string,
  relatedChallengeIds: string[] = [],
): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    const categoryTag = `[#${category}]`;
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduledNotifications) {
      const notifType = getNotificationDataString(notification.content.data, 'type');
      if (notifType !== 'challenge_progress') {
        continue;
      }

      const notifChallengeId = getNotificationDataString(notification.content.data, 'challengeId');
      const dataCategory = getNotificationDataString(notification.content.data, 'category');
      const title = notification.content.title ?? '';
      const identifierMatches = relatedChallengeIds.some((id) =>
        notification.identifier.startsWith(`challenge_progress_${id}_`),
      );

      const matches =
        identifierMatches ||
        (notifChallengeId !== undefined && relatedChallengeIds.includes(notifChallengeId)) ||
        dataCategory === category ||
        title.includes(categoryTag);

      if (matches) {
        await cancelScheduledNotificationByIdentifier(notification.identifier);
      }
    }

    for (const challengeId of relatedChallengeIds) {
      const milestones = [10, 30, 50, 70, 90];
      for (const milestone of milestones) {
        await cancelScheduledNotificationByIdentifier(`challenge_progress_${challengeId}_${milestone}`);
        await AsyncStorage.removeItem(`challenge_progress_${challengeId}_${milestone}`);
      }
    }
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel progress by category:', error);
  }
}

export async function cancelChallengeProgressNotifications(challengeId: string): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduledNotifications) {
      const notifChallengeId = getNotificationDataString(notification.content.data, 'challengeId');
      const notifType = getNotificationDataString(notification.content.data, 'type');
      const identifierMatches = notification.identifier.startsWith(`challenge_progress_${challengeId}_`);

      if (
        (notifType === 'challenge_progress' && notifChallengeId === challengeId) ||
        identifierMatches
      ) {
        await cancelScheduledNotificationByIdentifier(notification.identifier);
      }
    }

    const milestones = [10, 30, 50, 70, 90];
    for (const milestone of milestones) {
      await cancelScheduledNotificationByIdentifier(`challenge_progress_${challengeId}_${milestone}`);
      await AsyncStorage.removeItem(`challenge_progress_${challengeId}_${milestone}`);
    }
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel progress notifications:', error);
  }
}

/**
 * 챌린지 실패 알림 취소
 * 특정 챌린지의 스케줄된 실패 알림을 취소하고 마킹도 제거
 */
export async function cancelChallengeFailureNotification(challengeId: string): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    const identifier = challengeFailureNotificationIdentifier(challengeId);
    await cancelScheduledNotificationByIdentifier(identifier);

    // identifier 미지정 시점에 잡힌 UUID 예약 정리
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    for (const notification of scheduledNotifications) {
      const notifChallengeId = getNotificationDataString(notification.content.data, 'challengeId');
      const notifType = getNotificationDataString(notification.content.data, 'type');
      
      if (
        notifType === 'challenge_failure' &&
        notifChallengeId === challengeId
      ) {
        try {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        } catch (cancelError) {
          console.error(`[notification-scheduler] 실패 알림 취소 실패: ${notification.identifier}`, cancelError);
        }
      }
    }
    
    await AsyncStorage.removeItem(identifier);
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel failure notification:', error);
  }
}

/**
 * 복원 직후에는 새 알림을 스케줄하지 않고, 이전 데이터 기준으로 남아 있던
 * 챌린지 예약/마킹만 정리합니다.
 */
export async function clearChallengeNotificationSchedulesForRestore(): Promise<void> {
  try {
    await cancelScheduledNotificationsByTypes(['challenge_progress', 'challenge_success', 'challenge_failure']);

    const keys = await AsyncStorage.getAllKeys();
    const challengeNotificationKeys = keys.filter(
      (key) =>
        key.startsWith('challenge_progress_') ||
        key.startsWith('challenge_success_') ||
        key.startsWith('challenge_failure_'),
    );
    if (challengeNotificationKeys.length > 0) {
      await AsyncStorage.multiRemove(challengeNotificationKeys);
    }
  } catch (error) {
    console.error('[notification-scheduler] Failed to clear challenge schedules after restore:', error);
  }
}

/**
 * 4. 챌린지 실패 알림
 * 소비율 100% 첫 초과 시, 종료일 다음날 오전 9시 30분
 */
export async function notifyChallengeFailure(
  category: string,
  percentage: number,
  challengeId: string,
  endDate: Date
): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    // Global check
    if (!(await shouldSendChallengeNotification())) {
      return;
    }
    
    // Only send if exceeded 100%
    if (percentage <= 100) {
      return;
    }
    
    const identifier = challengeFailureNotificationIdentifier(challengeId);
    const alreadySent = await AsyncStorage.getItem(identifier);
    
    if (alreadySent) {
      // Double check: verify if notification is actually scheduled
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const existingNotification = scheduledNotifications.find((n) => {
        const notifChallengeId = getNotificationDataString(n.content.data, 'challengeId');
        const notifType = getNotificationDataString(n.content.data, 'type');
        return notifType === 'challenge_failure' && notifChallengeId === challengeId;
      });
      
      // If notification exists, don't schedule again
      if (existingNotification) {
        return;
      }
    }
    
    const notificationDate = getChallengeOutcomeNotificationDate(endDate);
    if (!notificationDate) {
      await markChallengeOutcomeNotificationHandled(identifier);
      return;
    }

    await cancelScheduledNotificationByIdentifier(identifier);

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `[#${category}] 목표 금액 초과 ⚠️`,
        body: `소비율 ${Math.round(percentage)}%, 목표 소비금액을 초과하였습니다. 내역을 확인하시고 소비를 줄여보시는건 어떨까요?`,
        data: { 
          type: 'challenge_failure',
          challengeId,
          percentage,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationDate,
      },
    });
    
    await AsyncStorage.setItem(identifier, 'true');
    
  } catch (error) {
    console.error('[notification-scheduler] Failed to schedule challenge failure notification:', error);
  }
}

/**
 * Cancel all scheduled notifications
 * Handles both one-time (DATE) and recurring (DAILY) notifications
 * Returns information about any remaining notifications
 */
export async function cancelAllNotifications(): Promise<NotificationRequest[]> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return [];
    }
    // Dev 테스트 버튼 용도: 단일 호출로 전체 취소 후 남은 항목 조회
    await Notifications.cancelAllScheduledNotificationsAsync();
    const remaining = await Notifications.getAllScheduledNotificationsAsync();
    return remaining;
  } catch (error) {
    // If error occurs, return whatever we can find
    try {
      const Notifications = getExpoNotifications();
      if (!Notifications) {
        return [];
      }
      const finalCheck = await Notifications.getAllScheduledNotificationsAsync();
      return finalCheck;
    } catch (e) {
      return [];
    }
  }
}

/**
 * Clear all notification marks and cancel all scheduled notifications (for testing)
 * Removes all notification-related keys from AsyncStorage and cancels all scheduled notifications
 */
export async function clearChallengeNotificationMarks(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    
    // 모든 알림 관련 키 찾기
    const notificationKeys = keys.filter(key => 
      key.startsWith('challenge_progress_') || 
      key.startsWith('challenge_failure_') || 
      key.startsWith('challenge_success_') ||
      key.startsWith('daily_reminder_')
    );
    
    if (notificationKeys.length > 0) {
      await AsyncStorage.multiRemove(notificationKeys);
      console.log(`✅ [알림 마킹] ${notificationKeys.length}개 마킹 삭제 완료`);
    } else {
      console.log('✅ [알림 마킹] 삭제할 마킹 없음');
    }
    
    // 실제 스케줄된 알림도 모두 취소
    await cancelAllNotifications();
    console.log('✅ [알림 마킹] 모든 스케줄된 알림 취소 완료');
  } catch (error) {
    console.error('❌ [알림 마킹] 삭제 중 에러:', error);
  }
}

/**
 * ✅ 일일 정리: 오래된 스케줄링 마킹 정리
 * 매일 자정에 이전 날짜 마킹들을 정리
 */
export async function cleanupOldSchedules(): Promise<void> {
  try {
    const today = new Date().toDateString();
    const keys = await AsyncStorage.getAllKeys();
    
    // daily_reminder_로 시작하는 키들 중 오늘 이전 것들 삭제
    const oldScheduleKeys = keys.filter(key => 
      key.startsWith('daily_reminder_') && key !== `daily_reminder_${today}`
    );
    
    if (oldScheduleKeys.length > 0) {
      await AsyncStorage.multiRemove(oldScheduleKeys);

    }
  } catch (error) {

  }
}

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getScheduledNotifications(): Promise<NotificationRequest[]> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return [];
    }
    const notifications = await Notifications.getAllScheduledNotificationsAsync();

    return notifications;
  } catch (error) {

    return [];
  }
}

/**
 * 🧪 테스트용: 즉시 알림 보내기
 * 개발 중 알림 테스트를 위한 함수
 */
export async function sendTestNotification(type: 'expense' | 'progress' | 'success' | 'failure' = 'expense'): Promise<void> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return;
    }
    // Global check: 알림 설정 + 권한
    if (!(await shouldSendNotification())) {

      return;
    }
    
    const notifications = {
      expense: {
        title: '오늘은 어떤 소비들을 하셨나요?',
        body: '시작이 반! 소비 기록을 통해 차근차근 소비습관을 개선해 보세요!',
      },
      progress: {
        title: '[#커피] 챌린지 진행현황',
        body: '50% 남음. 오늘의 소비는 어떠셨나요?',
      },
      success: {
        title: '[#커피] 챌린지 성공! 🎉',
        body: '소비율 85%, 축하드려요. 이 소비패턴을 유지하기 위해 챌린지를 지속해 보세요!',
      },
      failure: {
        title: '[#커피] 목표 금액 초과 ⚠️',
        body: '소비율 105%, 목표 소비금액을 초과하였습니다. 내역을 확인하시고 소비를 줄여보시는건 어떨까요?',
      },
    };
    
    const notification = notifications[type];
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: { type: `test_${type}` },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2, // 2초 후 발송
      },
    });

  } catch (error) {

  }
}

