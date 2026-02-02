/**
 * Notification Scheduler
 * 
 * Manages scheduled notifications with proper permission checks
 * Implements all push message policies
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

/**
 * Check if notifications should be sent
 * Returns true only if both app setting and system permission are granted
 */
async function shouldSendNotification(): Promise<boolean> {
  try {
    // 1. Check app setting (ensure default value exists)
    let notificationsEnabled = await AsyncStorage.getItem('notificationsEnabled');
    if (notificationsEnabled === null) {
      notificationsEnabled = 'true';
      await AsyncStorage.setItem('notificationsEnabled', JSON.stringify(true));
    }

    if (notificationsEnabled !== 'true') {
      return false;
    }
    
    // 2. Check system permission
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if user has recorded any expense today
 */
async function hasExpenseToday(): Promise<boolean> {
  try {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const calendarData = await AsyncStorage.getItem('calendarData');
    if (!calendarData) return false;
    
    const data = JSON.parse(calendarData);
    const todayData = data[dateKey];
    
    return todayData?.totalExpense && todayData.totalExpense > 0;
  } catch (error) {
    return false;
  }
}

/**
 * 1. 소비 기록 유도 알림
 * 매일 오후 8시, 당일 소비 기록 0건일 때만
 */
export async function setupDailyReminder(): Promise<void> {
  try {
    // ✅ 항상 먼저 취소 → 최대 1개만 유지 (중복 푸시 방지)
    await cancelDailyReminder();

    // Global check: 알림 설정 + 권한
    if (!(await shouldSendNotification())) {
      return;
    }

    // 소비 기록이 있으면 당일 알림 스케줄하지 않음
    if (await hasExpenseToday()) {
      return;
    }

    const today = new Date().toDateString();
    const scheduledKey = `daily_reminder_${today}`;

    // Schedule notification for 8 PM daily
    await Notifications.scheduleNotificationAsync({
      identifier: 'daily_expense_reminder',
      content: {
        title: '오늘은 어떤 소비들을 하셨나요?',
        body: '시작이 반! 소비 기록을 통해 차근차근 소비습관을 개선해 보세요!',
        data: { type: 'expense_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    });
    
    // ✅ 스케줄링 완료 마킹
    await AsyncStorage.setItem(scheduledKey, 'true');
    
  } catch (error) {
  }
}

/**
 * 소비 기록 저장 시 당일 알림 취소
 */
export async function cancelDailyReminder(): Promise<void> {
  try {
    // Global check: 알림 설정 + 권한
    if (!(await shouldSendNotification())) {
      return;
    }
    
    // 당일 알림 취소
    try {
      await Notifications.cancelScheduledNotificationAsync('daily_expense_reminder');
    } catch (error) {
      // Ignore if not found
    }
    
    // 오늘 날짜의 스케줄링 마킹 제거
    const today = new Date().toDateString();
    const scheduledKey = `daily_reminder_${today}`;
    await AsyncStorage.removeItem(scheduledKey);
    
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel daily reminder:', error);
  }
}

/**
 * 소비 기록 삭제 시 당일 알림 재스케줄링 (오후 8시 전이면)
 */
export async function rescheduleDailyReminderIfNeeded(): Promise<void> {
  try {
    // ✅ 항상 먼저 취소 → 최대 1개만 유지 (중복 푸시 방지)
    await cancelDailyReminder();

    // Global check: 알림 설정 + 권한
    if (!(await shouldSendNotification())) {
      return;
    }

    const now = new Date();
    const currentHour = now.getHours();

    // 오후 8시가 지났으면 스케줄링하지 않음
    if (currentHour >= 20) {
      return;
    }

    // 소비 기록이 있으면 스케줄링하지 않음
    if (await hasExpenseToday()) {
      return;
    }

    const today = new Date().toDateString();
    const scheduledKey = `daily_reminder_${today}`;
    const today8PM = new Date();
    today8PM.setHours(20, 0, 0, 0);

    if (today8PM.getTime() <= now.getTime()) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: 'daily_expense_reminder',
      content: {
        title: '오늘은 어떤 소비들을 하셨나요?',
        body: '시작이 반! 소비 기록을 통해 차근차근 소비습관을 개선해 보세요!',
        data: { type: 'expense_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: today8PM,
      },
    });
    
    // 스케줄링 완료 마킹
    await AsyncStorage.setItem(scheduledKey, 'true');
    
  } catch (error) {
    console.error('[notification-scheduler] Failed to reschedule daily reminder:', error);
  }
}

/**
 * 챌린지에 소비 기록이 있는지 확인
 */
async function hasChallengeRecords(challengeId: string): Promise<boolean> {
  try {
    const storedData = await AsyncStorage.getItem('calendarData');
    if (!storedData) return false;
    
    const calendarData = JSON.parse(storedData);
    
    // 모든 날짜의 기록을 확인하여 해당 챌린지 카테고리의 소비 기록이 있는지 체크
    for (const [dateString, dateData] of Object.entries(calendarData)) {
      if (dateData && typeof dateData === 'object' && dateData.records && Array.isArray(dateData.records)) {
        const hasRecord = dateData.records.some((record: any) => {
          return record.type === 'expense' && record.challengeId === challengeId;
        });
        if (hasRecord) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    return false;
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
  referenceDate: Date
): Promise<void> {
  try {
    if (!(await shouldSendNotification())) {
      return;
    }
    
    if (percentage >= 100) {
      return;
    }
    
    const storedData = await AsyncStorage.getItem('calendarData');
    if (storedData) {
      const calendarData = JSON.parse(storedData);
      let hasRecord = false;
      for (const [dateString, dateData] of Object.entries(calendarData)) {
        if (dateData && typeof dateData === 'object' && dateData.records && Array.isArray(dateData.records)) {
          const found = dateData.records.some((record: any) => {
            return record.type === 'expense' && record.category === category;
          });
          if (found) {
            hasRecord = true;
            break;
          }
        }
      }
      if (!hasRecord) return;
    } else {
      return;
    }
    
    // 해당 날짜+1일 9:30이 이미 과거면 스케줄하지 않음 (이미 받은 푸시 재발송 방지)
    const scheduleAt = new Date(referenceDate);
    scheduleAt.setDate(scheduleAt.getDate() + 1);
    scheduleAt.setHours(9, 30, 0, 0);
    if (scheduleAt.getTime() <= Date.now()) {
      return;
    }
    
    const sentKey = `challenge_progress_${challengeId}_${milestone}`;
    const alreadySent = await AsyncStorage.getItem(sentKey);
    if (alreadySent) {
      return;
    }
    
    const identifier = `challenge_progress_${challengeId}_${milestone}`;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `[#${category}] 챌린지 진행현황`,
        body: `${Math.round(100 - percentage)}% 남음. 오늘의 소비는 어떠셨나요?`,
        data: { 
          type: 'challenge_progress',
          challengeId,
          percentage,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduleAt,
      },
    });
    
    await AsyncStorage.setItem(sentKey, 'true');
    
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
    // Global check
    if (!(await shouldSendNotification())) {
      return;
    }
    
    // Check if already sent
    const sentKey = `challenge_success_${challengeId}`;
    const alreadySent = await AsyncStorage.getItem(sentKey);
    if (alreadySent) {
      return;
    }
    
    // Only send if success (≤ 100%)
    if (percentage > 100) {
      return;
    }
    
    // Schedule for next day after end date, 9:30 AM
    const notificationDate = new Date(endDate);
    notificationDate.setDate(notificationDate.getDate() + 1);
    notificationDate.setHours(9, 30, 0, 0);
    
    await Notifications.scheduleNotificationAsync({
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
    
    // Mark as sent
    await AsyncStorage.setItem(sentKey, 'true');
    
  } catch (error) {
  }
}

/**
 * 챌린지 성공 알림 취소
 * 특정 챌린지의 스케줄된 성공 알림을 취소하고 마킹도 제거
 */
export async function cancelChallengeSuccessNotification(challengeId: string): Promise<void> {
  try {
    // 스케줄된 알림 중 해당 챌린지의 성공 알림 찾아서 취소
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    for (const notification of scheduledNotifications) {
      if (
        notification.content.data?.type === 'challenge_success' &&
        notification.content.data?.challengeId === challengeId
      ) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
    
    // AsyncStorage 마킹도 제거
    const sentKey = `challenge_success_${challengeId}`;
    await AsyncStorage.removeItem(sentKey);
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel success notification:', error);
  }
}

/**
 * 챌린지 진행현황 알림 취소
 * 특정 챌린지의 모든 진행현황 알림(10%, 30%, 50%, 70%, 90%)을 취소하고 마킹도 제거
 */
export async function cancelChallengeProgressNotifications(challengeId: string): Promise<void> {
  try {
    // 스케줄된 알림 중 해당 챌린지의 모든 진행현황 알림 찾아서 취소
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    for (const notification of scheduledNotifications) {
      const notifChallengeId = notification.content.data?.challengeId;
      const notifType = notification.content.data?.type;
      
      if (
        notifType === 'challenge_progress' &&
        notifChallengeId === challengeId
      ) {
        try {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        } catch (cancelError) {
          console.error(`[notification-scheduler] 알림 취소 실패: ${notification.identifier}`, cancelError);
        }
      }
    }
    
    // 모든 마일스톤의 AsyncStorage 마킹 제거
    const milestones = [10, 30, 50, 70, 90];
    for (const milestone of milestones) {
      const sentKey = `challenge_progress_${challengeId}_${milestone}`;
      await AsyncStorage.removeItem(sentKey);
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
    // 스케줄된 알림 중 해당 챌린지의 실패 알림 찾아서 취소
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    for (const notification of scheduledNotifications) {
      const notifChallengeId = notification.content.data?.challengeId;
      const notifType = notification.content.data?.type;
      
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
    
    // AsyncStorage 마킹도 제거
    const sentKey = `challenge_failure_${challengeId}`;
    await AsyncStorage.removeItem(sentKey);
  } catch (error) {
    console.error('[notification-scheduler] Failed to cancel failure notification:', error);
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
    // Global check
    if (!(await shouldSendNotification())) {
      return;
    }
    
    // Only send if exceeded 100%
    if (percentage <= 100) {
      return;
    }
    
    // Check if already sent (only once when first exceeding 100%)
    const sentKey = `challenge_failure_${challengeId}`;
    const alreadySent = await AsyncStorage.getItem(sentKey);
    
    if (alreadySent) {
      // Double check: verify if notification is actually scheduled
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const existingNotification = scheduledNotifications.find(
        n => n.content.data?.challengeId === challengeId && 
             n.content.data?.type === 'challenge_failure'
      );
      
      // If notification exists, don't schedule again
      if (existingNotification) {
        return;
      }
    }
    
    // Schedule for next day after end date, 9:30 AM
    const notificationDate = new Date(endDate);
    notificationDate.setDate(notificationDate.getDate() + 1);
    notificationDate.setHours(9, 30, 0, 0);
    
    await Notifications.scheduleNotificationAsync({
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
    
    // Mark as sent
    await AsyncStorage.setItem(sentKey, 'true');
    
  } catch (error) {
  }
}

/**
 * Cancel all scheduled notifications
 * Handles both one-time (DATE) and recurring (DAILY) notifications
 * Returns information about any remaining notifications
 */
export async function cancelAllNotifications(): Promise<Array<Notifications.NotificationRequest>> {
  try {
    // Cancel all scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Return any remaining notifications (for debugging)
    const remaining = await Notifications.getAllScheduledNotificationsAsync();
    return remaining;
  } catch (error) {
    // If error occurs, return whatever we can find
    try {
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
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
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

