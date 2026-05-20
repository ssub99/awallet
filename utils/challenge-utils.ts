/**
 * Challenge Utilities
 * 
 * Challenge calculation and notification trigger logic
 */

import { parseCalendarDateKeyLocal } from '@/utils/custom-month';
import type { CalendarData, CalendarRecord } from '@/utils/consumption-index';
import { parseCalendarDataFromJson } from '@/utils/calendar-data-parse';
import { extractTimestampFromId } from '@/utils/id-generator';
import { getAllExpenses, type ExpenseRecord } from '@/utils/expenses';
import { rebuildCalendarDataFromStores } from '@/utils/rebuild-calendar-data';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NotificationContent } from 'expo-notifications';

import { getExpoNotifications } from '@/utils/expo-notifications-client';
import {
    getAllChallenges,
    logChallengeResultForRecord,
    type ChallengeRecord as ChallengeData,
} from './challenges';
import {
    cancelChallengeFailureNotification,
    cancelChallengeProgressNotifications,
    cancelChallengeProgressNotificationsByCategory,
    cancelChallengeSuccessNotification,
    getChallengeNotificationsEnabled,
    notifyChallengeFailure,
    notifyChallengeProgress,
    notifyChallengeSuccess,
} from './notification-scheduler';

export interface ChallengeStatus {
  challenge: ChallengeData;
  currentAmount: number;
  percentage: number;
  isActive: boolean;
  isEnded: boolean;
  daysLeft: number;
}

function parseChallengeDateLocal(dateString: string): Date {
  const parsed = new Date(dateString.replace(/\./g, '-'));
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function normalizeChallengeLookupDate(date: Date): Date {
  const normalized = new Date(date);
  if (!Number.isFinite(normalized.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function isChallengeActiveOnDate(challenge: ChallengeData, date: Date): boolean {
  const targetTime = normalizeChallengeLookupDate(date);
  const startDate = parseChallengeDateLocal(challenge.startDate);
  const endDate = parseChallengeDateLocal(challenge.endDate);
  return targetTime >= startDate && targetTime <= endDate;
}

/**
 * 특정 카테고리·날짜에 겹치는 활성 챌린지 전부 (동일 카테고리 복수 챌린지 대응)
 */
export async function getActiveChallengesByCategory(
  category: string,
  date: Date = new Date(),
): Promise<ChallengeData[]> {
  try {
    const challenges = await getAllChallenges();
    return challenges.filter(
      (challenge) =>
        !challenge.isDeleted &&
        challenge.category === category &&
        isChallengeActiveOnDate(challenge, date),
    );
  } catch (error) {
    console.error('[challenge-utils] Failed to get active challenges:', error);
    return [];
  }
}

/** @deprecated 단일 조회가 필요할 때 — 복수 중 첫 항목 */
export async function getActiveChallengeByCategory(
  category: string,
  date: Date = new Date(),
): Promise<ChallengeData | null> {
  const active = await getActiveChallengesByCategory(category, date);
  return active[0] ?? null;
}

/**
 * 챌린지의 현재 소비금액 계산
 * @param challenge 챌린지 데이터
 * @param calendarData 캐시된 calendarData (선택적, 제공되지 않으면 AsyncStorage에서 로드)
 */
function readScheduledNotificationChallengeId(
  data: NotificationContent['data'],
): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const challengeId = (data as Record<string, unknown>).challengeId;
  return typeof challengeId === 'string' && challengeId.length > 0 ? challengeId : undefined;
}

export async function calculateChallengeAmount(
  challenge: ChallengeData,
  calendarData?: CalendarData
): Promise<number> {
  try {
    // calendarData가 제공되지 않으면 AsyncStorage에서 로드
    let data: CalendarData | undefined = calendarData;
    if (!data) {
      const storedData = await AsyncStorage.getItem('calendarData');
      if (!storedData) return 0;
      data = parseCalendarDataFromJson(storedData);
    }

    let totalAmount = 0;

    const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));

    Object.entries(data).forEach(([dateString, dateData]) => {
      if (dateData?.records && Array.isArray(dateData.records)) {
        dateData.records.forEach((record) => {
          if (record.type === 'expense' && record.category === challenge.category) {
            const itemDate = new Date(dateString);
            
            // 챌린지 기간 내의 데이터만 포함
            if (itemDate >= startDate && itemDate <= endDate) {
              totalAmount += record.amount || 0;
            }
          }
        });
      }
    });

    return totalAmount;
  } catch (error) {

    return 0;
  }
}

const PROGRESS_MILESTONES = [10, 30, 50, 70, 90] as const;

let challengeNotificationOperationQueue: Promise<void> = Promise.resolve();

function runChallengeNotificationExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = challengeNotificationOperationQueue.then(operation, operation);
  challengeNotificationOperationQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );
  return nextOperation;
}

async function loadCalendarDataFromStorage(): Promise<CalendarData> {
  const storedData = await AsyncStorage.getItem('calendarData');
  return parseCalendarDataFromJson(storedData);
}

/** 현재 소비율이 속한 진행현황 마일스톤(10·30·50·70·90). 100% 이상이면 null */
export function getProgressMilestoneForPercentage(percentage: number): number | null {
  if (percentage >= 100) {
    return null;
  }
  for (let i = 0; i < PROGRESS_MILESTONES.length; i++) {
    const milestone = PROGRESS_MILESTONES[i];
    const max = i < PROGRESS_MILESTONES.length - 1 ? PROGRESS_MILESTONES[i + 1] : 100;
    if (percentage >= milestone && percentage < max) {
      return milestone;
    }
  }
  return null;
}

export function parseProgressNotificationMilestone(
  identifier: string,
  challengeId: string,
): number | null {
  const prefix = `challenge_progress_${challengeId}_`;
  if (!identifier.startsWith(prefix)) {
    return null;
  }
  const value = Number(identifier.slice(prefix.length));
  return Number.isFinite(value) ? value : null;
}

function getExpenseCreatedAtMs(expense: ExpenseRecord): number | null {
  if (typeof expense.createdAt === 'string' && expense.createdAt.length > 0) {
    const fromCreatedAt = parseOptionalDateTimeToMs(expense.createdAt);
    if (fromCreatedAt !== null) {
      return fromCreatedAt;
    }
  }
  if (typeof expense.timestamp === 'number' && Number.isFinite(expense.timestamp) && expense.timestamp > 0) {
    return expense.timestamp;
  }
  if (typeof expense.id === 'string' && expense.id.length > 0) {
    return extractTimestampFromId(expense.id);
  }
  return null;
}

function isExpenseInChallengePeriod(expense: ExpenseRecord, challenge: ChallengeData): boolean {
  const startDate = parseChallengeDateLocal(challenge.startDate);
  const endDate = parseChallengeDateLocal(challenge.endDate);
  const itemDate = parseChallengeDateLocal(expense.date);
  return itemDate >= startDate && itemDate <= endDate;
}

/** 알림 판정용 — expenseData(원본) 기준 합산 (calendar 미러와 어긋남 방지) */
async function calculateChallengePercentageFromExpenseStore(
  challenge: ChallengeData,
): Promise<{ currentAmount: number; percentage: number }> {
  const expenses = await getAllExpenses();
  const startDate = parseChallengeDateLocal(challenge.startDate);
  const endDate = parseChallengeDateLocal(challenge.endDate);
  let totalAmount = 0;

  for (const expense of expenses) {
    if (expense.isDeleted || expense.isRefunded) {
      continue;
    }
    if (expense.category !== challenge.category) {
      continue;
    }
    const itemDate = parseChallengeDateLocal(expense.date);
    if (itemDate >= startDate && itemDate <= endDate) {
      totalAmount += expense.amount || 0;
    }
  }

  const percentage =
    challenge.targetAmount > 0 ? (totalAmount / challenge.targetAmount) * 100 : 0;
  return { currentAmount: totalAmount, percentage };
}

async function hasChallengeCategoryExpenseInStore(challenge: ChallengeData): Promise<boolean> {
  const expenses = await getAllExpenses();
  return expenses.some(
    (expense) =>
      !expense.isDeleted &&
      !expense.isRefunded &&
      expense.category === challenge.category &&
      isExpenseInChallengePeriod(expense, challenge),
  );
}

async function hasPostAnchorChallengeCategoryExpenseFromStore(
  challenge: ChallengeData,
  anchorMs: number,
): Promise<boolean> {
  const expenses = await getAllExpenses();
  return expenses.some((expense) => {
    if (expense.isDeleted || expense.isRefunded) {
      return false;
    }
    if (expense.category !== challenge.category || !isExpenseInChallengePeriod(expense, challenge)) {
      return false;
    }
    const createdMs = getExpenseCreatedAtMs(expense);
    return createdMs !== null && createdMs >= anchorMs;
  });
}

async function getReferenceDateForProgressNotificationFromStore(
  challenge: ChallengeData,
  milestone: number,
  fullPercentage: number,
  anchorMs: number,
): Promise<Date | null> {
  const next = PROGRESS_MILESTONES.find((m) => m > milestone) ?? 100;
  if (fullPercentage < milestone || fullPercentage >= next) {
    return null;
  }

  const expenses = await getAllExpenses();
  let latest: Date | null = null;

  for (const expense of expenses) {
    if (expense.isDeleted || expense.isRefunded) {
      continue;
    }
    if (expense.category !== challenge.category || !isExpenseInChallengePeriod(expense, challenge)) {
      continue;
    }
    const createdMs = getExpenseCreatedAtMs(expense);
    if (createdMs === null || createdMs < anchorMs) {
      continue;
    }
    const itemDate = parseChallengeDateLocal(expense.date);
    if (!latest || itemDate.getTime() > latest.getTime()) {
      latest = itemDate;
    }
  }

  return latest;
}

/** OS에 남은 진행 알림이 현재 마일스톤·소비율과 일치하는지 강제 */
async function enforceChallengeProgressNotificationState(
  challenge: ChallengeData,
  expectedMilestone: number | null,
  livePercentage: number,
): Promise<void> {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const categoryTag = `[#${challenge.category}]`;
  const liveRounded = Math.round(livePercentage);

  for (const notification of scheduledNotifications) {
    const data = notification.content.data;
    if (!data || typeof data !== 'object' || (data as Record<string, unknown>).type !== 'challenge_progress') {
      continue;
    }

    const notifChallengeId = readScheduledNotificationChallengeId(data);
    const dataCategory = (data as Record<string, unknown>).category;
    const title = notification.content.title ?? '';
    const matchesChallenge =
      notifChallengeId === challenge.id ||
      dataCategory === challenge.category ||
      (notifChallengeId === undefined && title.includes(categoryTag));

    if (!matchesChallenge) {
      continue;
    }

    const identifierMilestone = parseProgressNotificationMilestone(
      notification.identifier,
      challenge.id,
    );
    const payloadPercentage = (data as Record<string, unknown>).percentage;
    const payloadRounded =
      typeof payloadPercentage === 'number' && Number.isFinite(payloadPercentage)
        ? Math.round(payloadPercentage)
        : null;

    const shouldKeep =
      expectedMilestone !== null &&
      identifierMilestone === expectedMilestone &&
      payloadRounded === liveRounded;

    if (!shouldKeep) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      } catch {
        // ignore
      }
      const milestoneToClear = identifierMilestone ?? expectedMilestone;
      if (milestoneToClear !== null) {
        await AsyncStorage.removeItem(`challenge_progress_${challenge.id}_${milestoneToClear}`);
      }
    }
  }
}

/**
 * 진행현황 알림: expenseData 기준 % 판정 → 취소 → 현재 구간 1개만 재스케줄
 */
async function syncChallengeProgressNotification(
  challenge: ChallengeData,
  today: Date,
  options?: { skipCalendarRebuild?: boolean },
): Promise<void> {
  const endDate = parseChallengeDateLocal(challenge.endDate);
  const todayNorm = new Date(today);
  todayNorm.setHours(0, 0, 0, 0);
  if (todayNorm > endDate) {
    return;
  }

  if (!options?.skipCalendarRebuild) {
    await rebuildCalendarDataFromStores();
  }

  const relatedIds = (await getActiveChallengesByCategory(challenge.category, today)).map((c) => c.id);
  await cancelChallengeProgressNotifications(challenge.id);
  await cancelChallengeProgressNotificationsByCategory(challenge.category, relatedIds);

  if (!(await hasChallengeCategoryExpenseInStore(challenge))) {
    await enforceChallengeProgressNotificationState(challenge, null, 0);
    return;
  }

  const { percentage } = await calculateChallengePercentageFromExpenseStore(challenge);

  if (percentage >= 100) {
    await enforceChallengeProgressNotificationState(challenge, null, percentage);
    return;
  }

  const expectedMilestone = getProgressMilestoneForPercentage(percentage);
  const anchorMs = getChallengeProgressNotificationAnchorMs(challenge);

  if (!(await hasPostAnchorChallengeCategoryExpenseFromStore(challenge, anchorMs))) {
    await enforceChallengeProgressNotificationState(challenge, null, percentage);
    return;
  }

  if (expectedMilestone === null) {
    await enforceChallengeProgressNotificationState(challenge, null, percentage);
    return;
  }

  const referenceDate = await getReferenceDateForProgressNotificationFromStore(
    challenge,
    expectedMilestone,
    percentage,
    anchorMs,
  );

  if (!referenceDate || !isScheduleTimeInFuture(referenceDate)) {
    await enforceChallengeProgressNotificationState(challenge, null, percentage);
    return;
  }

  await notifyChallengeProgress(
    challenge.category,
    percentage,
    challenge.id,
    expectedMilestone,
    referenceDate,
  );

  await enforceChallengeProgressNotificationState(challenge, expectedMilestone, percentage);
}

type ExpenseCalendarRecord = CalendarRecord & {
  createdAt?: string;
  timestamp?: number;
};

/** 진행현황 알림: 챌린지 생성(또는 재생성) 이후 기록만 대상으로 하는 기준 시각 */
export function getChallengeProgressNotificationAnchorMs(challenge: ChallengeData): number {
  if (typeof challenge.createdAt === 'number' && Number.isFinite(challenge.createdAt) && challenge.createdAt > 0) {
    return challenge.createdAt;
  }
  const start = new Date(challenge.startDate.replace(/\./g, '-'));
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function parseOptionalDateTimeToMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getExpenseRecordCreatedAtMs(record: ExpenseCalendarRecord): number | null {
  if (typeof record.createdAt === 'string' && record.createdAt.length > 0) {
    const fromCreatedAt = parseOptionalDateTimeToMs(record.createdAt);
    if (fromCreatedAt !== null) {
      return fromCreatedAt;
    }
  }
  if (typeof record.timestamp === 'number' && Number.isFinite(record.timestamp) && record.timestamp > 0) {
    return record.timestamp;
  }
  if (typeof record.id === 'string' && record.id.length > 0) {
    return extractTimestampFromId(record.id);
  }
  return null;
}

function isPostAnchorExpenseRecord(
  record: ExpenseCalendarRecord,
  challenge: ChallengeData,
  anchorMs: number,
): boolean {
  if (record.type !== 'expense' || record.category !== challenge.category || record.isDeleted) {
    return false;
  }
  const createdMs = getExpenseRecordCreatedAtMs(record);
  if (createdMs === null) {
    return false;
  }
  return createdMs >= anchorMs;
}

export function hasPostAnchorChallengeCategoryExpense(
  challenge: ChallengeData,
  calendarData: CalendarData,
  anchorMs?: number,
): boolean {
  const anchor = anchorMs ?? getChallengeProgressNotificationAnchorMs(challenge);
  return Object.values(calendarData).some((dateData) => {
    if (!dateData?.records?.length) {
      return false;
    }
    return dateData.records.some((record) =>
      isPostAnchorExpenseRecord(record as ExpenseCalendarRecord, challenge, anchor),
    );
  });
}

/**
 * 진행현황 알림용 referenceDate.
 * 화면 소비율(전체 기간) 기준 현재 마일스톤 구간에 들어 있고,
 * 챌린지 생성 이후(post-anchor) 소비 기록이 있을 때 그중 가장 최근 기록일을 반환합니다.
 */
export function getReferenceDateForProgressNotification(
  challenge: ChallengeData,
  milestone: number,
  calendarData: CalendarData,
  fullPercentage: number,
): Date | null {
  const next = PROGRESS_MILESTONES.find((m) => m > milestone) ?? 100;
  if (fullPercentage < milestone || fullPercentage >= next) {
    return null;
  }

  const anchorMs = getChallengeProgressNotificationAnchorMs(challenge);
  const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
  const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  let latest: Date | null = null;

  Object.entries(calendarData).forEach(([dateString, dateData]) => {
    const itemDate = parseCalendarDateKeyLocal(dateString) ?? new Date(dateString);
    itemDate.setHours(0, 0, 0, 0);
    if (itemDate < startDate || itemDate > endDate) {
      return;
    }
    if (!dateData?.records?.length) {
      return;
    }

    const hasPostAnchorOnDay = dateData.records.some((record) =>
      isPostAnchorExpenseRecord(record as ExpenseCalendarRecord, challenge, anchorMs),
    );
    if (!hasPostAnchorOnDay) {
      return;
    }

    if (!latest || itemDate.getTime() > latest.getTime()) {
      latest = itemDate;
    }
  });

  return latest;
}

/**
 * 특정 날짜(asOfDate) 기준으로 챌린지 소비금액 계산
 * record 날짜 ≤ asOfDate 이고 챌린지 기간·카테고리 맞는 소비만 합산
 */
export function calculateChallengeAmountAsOfDate(
  challenge: ChallengeData,
  calendarData: CalendarData,
  asOfDate: Date
): number {
  try {
    let totalAmount = 0;
    const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    const asOf = new Date(asOfDate);
    asOf.setHours(23, 59, 59, 999);

    Object.entries(calendarData).forEach(([dateString, dateData]) => {
      if (dateData?.records && Array.isArray(dateData.records)) {
        const itemDate = new Date(dateString);
        if (itemDate > asOf) return;
        dateData.records.forEach((record) => {
          if (record.type === 'expense' && record.category === challenge.category) {
            if (itemDate >= startDate && itemDate <= endDate) {
              totalAmount += record.amount || 0;
            }
          }
        });
      }
    });
    return totalAmount;
  } catch {
    return 0;
  }
}

/**
 * 해당 마일스톤에 처음 들어선 날(해당 날짜) 반환
 * 기간 내 해당 카테고리 기록이 있는 날만 날짜 순으로 순회해 [milestone, next)에 처음 들어선 날 반환
 */
export function getReferenceDateForMilestone(
  challenge: ChallengeData,
  milestone: number,
  calendarData: CalendarData
): Date | null {
  try {
    const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    const targetAmount = challenge.targetAmount;
    if (targetAmount <= 0) return null;

    const recordDates: string[] = [];
    Object.entries(calendarData).forEach(([dateString, dateData]) => {
      if (dateData?.records && Array.isArray(dateData.records)) {
        const itemDate = new Date(dateString);
        if (itemDate >= startDate && itemDate <= endDate) {
          const hasMatch = dateData.records.some(
            (r) => r.type === 'expense' && r.category === challenge.category,
          );
          if (hasMatch) recordDates.push(dateString);
        }
      }
    });
    recordDates.sort((a, b) => a.localeCompare(b));

    const next = PROGRESS_MILESTONES.find((m) => m > milestone) ?? 100;
    for (const dateString of recordDates) {
      const asOfDate = new Date(dateString);
      const amount = calculateChallengeAmountAsOfDate(challenge, calendarData, asOfDate);
      const percentage = (amount / targetAmount) * 100;
      if (percentage >= milestone && percentage < next) {
        return new Date(dateString);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function hasChallengeCategoryExpenseRecord(challenge: ChallengeData, calendarData: CalendarData): boolean {
  return Object.values(calendarData).some((dateData) => {
    if (!dateData?.records || !Array.isArray(dateData.records)) return false;
    return dateData.records.some(
      (record) => record.type === 'expense' && record.category === challenge.category,
    );
  });
}

/**
 * 챌린지 상태 계산
 * @param challenge 챌린지 데이터
 * @param calendarData 캐시된 calendarData (선택적, 제공되지 않으면 AsyncStorage에서 로드)
 */
export async function getChallengeStatus(
  challenge: ChallengeData,
  calendarData?: CalendarData
): Promise<ChallengeStatus> {
  const currentAmount = await calculateChallengeAmount(challenge, calendarData);
  const percentage = challenge.targetAmount > 0 ? (currentAmount / challenge.targetAmount) * 100 : 0;
  
  const today = new Date();
  const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
  const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    challenge,
    currentAmount,
    percentage,
    isActive: daysLeft >= 0,
    isEnded: daysLeft < 0,
    daysLeft,
  };
}

/**
 * referenceDate+1일 9:30이 미래인지 여부
 */
export function isScheduleTimeInFuture(referenceDate: Date): boolean {
  const scheduleAt = new Date(referenceDate);
  scheduleAt.setDate(scheduleAt.getDate() + 1);
  scheduleAt.setHours(9, 30, 0, 0);
  return scheduleAt.getTime() > Date.now();
}

/**
 * 소비 기록 시 챌린지 알림 트리거
 * 소비 기록이 저장/삭제될 때 호출하여 조건에 맞는 알림 발송
 */
export async function triggerChallengeNotifications(category: string, recordDate: Date): Promise<void> {
  return runChallengeNotificationExclusive(async () => {
    try {
      const lookupDate = normalizeChallengeLookupDate(recordDate);
      const challenges = await getActiveChallengesByCategory(category, lookupDate);
      if (challenges.length === 0) {
        return;
      }

      await rebuildCalendarDataFromStores();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const challenge of challenges) {
        const endDate = parseChallengeDateLocal(challenge.endDate);
        const isEndedByToday = today > endDate;

        if (!isEndedByToday) {
          await syncChallengeProgressNotification(challenge, today, { skipCalendarRebuild: true });

          if (!(await hasChallengeCategoryExpenseInStore(challenge))) {
            await cancelChallengeSuccessNotification(challenge.id);
            await cancelChallengeFailureNotification(challenge.id);
            continue;
          }
        }

        const { percentage } = await calculateChallengePercentageFromExpenseStore(challenge);

        const successKey = `challenge_success_${challenge.id}`;
        const failureKey = `challenge_failure_${challenge.id}`;
        const [successSent, failureSent] = await Promise.all([
          AsyncStorage.getItem(successKey),
          AsyncStorage.getItem(failureKey),
        ]);

        if (!isEndedByToday) {
          if (percentage > 100) {
            await cancelChallengeSuccessNotification(challenge.id);
            if (!failureSent) {
              await notifyChallengeFailure(challenge.category, percentage, challenge.id, endDate);
            }
          } else if (!successSent && !failureSent) {
            await notifyChallengeSuccess(challenge.category, percentage, challenge.id, endDate);
          }
        }
      }
    } catch (error) {
      console.error('[challenge-utils] Failed to trigger challenge notifications:', error);
    }
  });
}

/**
 * 활성 챌린지의 누락된 알림 체크 및 발송 (앱 시작 시 실행)
 * 이미 저장된 소비 기록이 있어도 알림이 누락된 경우 보완
 */
export async function checkActiveChallengesNotifications(): Promise<void> {
  return runChallengeNotificationExclusive(async () => {
    try {
      const challengeNotificationsEnabled = await getChallengeNotificationsEnabled();
      if (!challengeNotificationsEnabled) {
        return;
      }

      const challenges = await getAllChallenges();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const Notifications = getExpoNotifications();
      if (!Notifications) {
        return;
      }

      // 1단계: 스케줄된 모든 챌린지 알림 확인 및 취소
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const progressNotifications = scheduledNotifications.filter(
        (n) => n.content.data?.type === 'challenge_progress',
      );
      const failureNotifications = scheduledNotifications.filter(
        (n) => n.content.data?.type === 'challenge_failure',
      );
      const successNotifications = scheduledNotifications.filter(
        (n) => n.content.data?.type === 'challenge_success',
      );

      const scheduledChallengeIds = new Set<string>();
      progressNotifications.forEach((n) => {
        const challengeId = readScheduledNotificationChallengeId(n.content.data);
        if (challengeId) {
          scheduledChallengeIds.add(challengeId);
        }
      });
      failureNotifications.forEach((n) => {
        const challengeId = readScheduledNotificationChallengeId(n.content.data);
        if (challengeId) {
          scheduledChallengeIds.add(challengeId);
        }
      });
      successNotifications.forEach((n) => {
        const challengeId = readScheduledNotificationChallengeId(n.content.data);
        if (challengeId) {
          scheduledChallengeIds.add(challengeId);
        }
      });

      for (const challengeId of scheduledChallengeIds) {
        await cancelChallengeProgressNotifications(challengeId);
        await cancelChallengeFailureNotification(challengeId);
        await cancelChallengeSuccessNotification(challengeId);
      }

      await rebuildCalendarDataFromStores();

      for (const challenge of challenges) {
        if (challenge.isDeleted) {
          continue;
        }

        const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
        const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

        if (today < startDate || today > endDate) {
          continue;
        }

        if (!(await hasChallengeCategoryExpenseInStore(challenge))) {
          continue;
        }

        await syncChallengeProgressNotification(challenge, today, { skipCalendarRebuild: true });

        const { percentage } = await calculateChallengePercentageFromExpenseStore(challenge);

        if (percentage > 100) {
          const sentKey = `challenge_failure_${challenge.id}`;
          const alreadySent = await AsyncStorage.getItem(sentKey);

          if (!alreadySent) {
            await cancelChallengeSuccessNotification(challenge.id);
            await notifyChallengeFailure(challenge.category, percentage, challenge.id, endDate);
          }
        }

        if (percentage <= 100) {
          await notifyChallengeSuccess(challenge.category, percentage, challenge.id, endDate);
        }
      }
    } catch (error) {
      console.error('[challenge-utils] Failed to check active challenges notifications:', error);
    }
  });
}

type EndedYesterdayPayload = {
  challenge: ChallengeData;
  status: ChallengeStatus;
  endDate: Date;
  result: 'success' | 'fail';
};

/**
 * 종료일이 오늘(로컬 자정)보다 이전인 챌린지만 순회 — 기간이 끝난 뒤 첫 접속(및 이후 미전송분)용 분석.
 */
async function forEachChallengeEndedBeforeToday(
  handler: (p: EndedYesterdayPayload) => Promise<void>,
): Promise<void> {
  const challenges = await getAllChallenges();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const challenge of challenges) {
    if (challenge.isDeleted) {
      continue;
    }

    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
    endDate.setHours(0, 0, 0, 0);

    // 종료일 당일은 아직 기간에 포함되므로 제외 (다음날 0시부터 판정 가능)
    if (endDate.getTime() >= today.getTime()) {
      continue;
    }

    const status = await getChallengeStatus(challenge);
    const result: 'success' | 'fail' = status.percentage <= 100 ? 'success' : 'fail';

    await handler({ challenge, status, endDate, result });
  }
}

/** 종료일이 어제(로컬)인 챌린지만 순회 — 성공 푸시 등 기존 알림 로직 전용 */
async function forEachChallengeEndedYesterday(
  handler: (p: EndedYesterdayPayload) => Promise<void>,
): Promise<void> {
  const challenges = await getAllChallenges();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const challenge of challenges) {
    if (challenge.isDeleted) {
      continue;
    }

    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
    endDate.setHours(0, 0, 0, 0);

    // 종료일이 어제인 챌린지만 체크 (종료일 다음날 알림·판정)
    if (endDate.getTime() !== yesterday.getTime()) {
      continue;
    }

    const status = await getChallengeStatus(challenge);
    const result: 'success' | 'fail' = status.percentage <= 100 ? 'success' : 'fail';

    await handler({ challenge, status, endDate, result });
  }
}

/**
 * 백업 복원 직후: 이미 종료된 챌린지는 `challenge_result`를 보내지 않도록
 * `emitEndedChallengeResultAnalytics`와 동일한 키(`challenge_result_logged_<id>`)를 선마킹합니다.
 * 진행 중 챌린지(종료일 ≥ 오늘 자정)는 건드리지 않아, 이후 정상 종료 시 결과 이벤트가 나갈 수 있습니다.
 */
export async function suppressChallengeResultAnalyticsForRestoredEndedChallenges(
  challenges: ChallengeData[],
): Promise<void> {
  if (challenges.length === 0) {
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pairs: [string, string][] = [];
  const seenIds = new Set<string>();

  for (const challenge of challenges) {
    if (challenge.isDeleted) {
      continue;
    }
    const id = typeof challenge.id === 'string' ? challenge.id.trim() : '';
    if (!id || seenIds.has(id)) {
      continue;
    }
    const endRaw = typeof challenge.endDate === 'string' ? challenge.endDate.trim() : '';
    if (!endRaw) {
      continue;
    }

    const endDate = new Date(endRaw.replace(/\./g, '-'));
    if (Number.isNaN(endDate.getTime())) {
      continue;
    }
    endDate.setHours(0, 0, 0, 0);

    // `forEachChallengeEndedBeforeToday`와 동일: 종료일 당일은 아직 기간에 포함 → 제외
    if (endDate.getTime() >= today.getTime()) {
      continue;
    }

    seenIds.add(id);
    pairs.push([`challenge_result_logged_${id}`, '1']);
  }

  if (pairs.length === 0) {
    return;
  }

  try {
    await AsyncStorage.multiSet(pairs);
  } catch (error) {
    console.error('[challenge-utils] Failed to suppress challenge_result after restore:', error);
  }
}

/**
 * 기간이 끝난 챌린지에 대해 challenge_result 분석만 기록 (알림·푸시 설정과 무관).
 * 종료 다음날 이후 언제 앱을 열든(또는 포그라운드 복귀) 그 시점 상태로 1회만 전송.
 * `judged_at`은 호출 시각(Date.now) 기준 로컬 시각.
 */
export async function emitEndedChallengeResultAnalytics(): Promise<void> {
  try {
    await forEachChallengeEndedBeforeToday(async ({ challenge, result }) => {
      const analyticsKey = `challenge_result_logged_${challenge.id}`;
      const alreadyLoggedResult = await AsyncStorage.getItem(analyticsKey);
      if (!alreadyLoggedResult) {
        logChallengeResultForRecord(challenge, Date.now(), result);
        await AsyncStorage.setItem(analyticsKey, '1');
      }
    });
  } catch (error) {
    console.error('[challenge-utils] Failed to emit ended challenge result analytics:', error);
  }
}

/**
 * 종료된 챌린지의 성공 알림 체크 (일일 배치 작업용)
 * 앱 시작 시 또는 매일 특정 시간에 실행
 */
export async function checkEndedChallenges(): Promise<void> {
  try {
    const challengeNotificationsEnabled = await getChallengeNotificationsEnabled();
    if (!challengeNotificationsEnabled) {
      return;
    }

    await forEachChallengeEndedYesterday(async ({ challenge, status, endDate }) => {
      // 성공 조건: 소비율이 100% 이하
      if (status.percentage <= 100) {
        const sentKey = `challenge_success_${challenge.id}`;
        const alreadySent = await AsyncStorage.getItem(sentKey);

        if (!alreadySent) {
          await notifyChallengeSuccess(
            challenge.category,
            status.percentage,
            challenge.id,
            endDate,
          );
        }
      }
    });
  } catch (error) {
    console.error('[challenge-utils] Failed to check ended challenges:', error);
  }
}

