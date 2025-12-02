/**
 * Challenge Utilities
 * 
 * Challenge calculation and notification trigger logic
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { notifyChallengeFailure, notifyChallengeProgress, notifyChallengeSuccess, cancelChallengeSuccessNotification, cancelChallengeProgressNotifications, cancelChallengeFailureNotification } from './notification-scheduler';
import {
  getAllChallenges,
  type ChallengeRecord as ChallengeData,
} from './challenges';

export interface ChallengeStatus {
  challenge: ChallengeData;
  currentAmount: number;
  percentage: number;
  isActive: boolean;
  isEnded: boolean;
  daysLeft: number;
}

/**
 * 특정 카테고리의 활성 챌린지 찾기
 */
export async function getActiveChallengeByCategory(
  category: string,
  date: Date = new Date()
): Promise<ChallengeData | null> {
  try {
    const challenges = await getAllChallenges();
    
    const targetTime = new Date(date);
    targetTime.setHours(0, 0, 0, 0);

    const activeChallenge = challenges.find((challenge) => {
      if (challenge.category !== category || challenge.isDeleted) {
        return false;
      }
      
      const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
      const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
      
      return targetTime >= startDate && targetTime <= endDate;
    });
    
    return activeChallenge ?? null;
  } catch (error) {
    console.error('[challenge-utils] Failed to get active challenge:', error);
    return null;
  }
}

/**
 * 챌린지의 현재 소비금액 계산
 * @param challenge 챌린지 데이터
 * @param calendarData 캐시된 calendarData (선택적, 제공되지 않으면 AsyncStorage에서 로드)
 */
export async function calculateChallengeAmount(
  challenge: ChallengeData,
  calendarData?: Record<string, any>
): Promise<number> {
  try {
    // calendarData가 제공되지 않으면 AsyncStorage에서 로드
    let data = calendarData;
    if (!data) {
      const storedData = await AsyncStorage.getItem('calendarData');
      if (!storedData) return 0;
      data = JSON.parse(storedData);
    }

    let totalAmount = 0;

    const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));

    Object.entries(data).forEach(([dateString, dateData]: [string, any]) => {
      if (dateData.records && Array.isArray(dateData.records)) {
        dateData.records.forEach((record: any) => {
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

/**
 * 챌린지 상태 계산
 * @param challenge 챌린지 데이터
 * @param calendarData 캐시된 calendarData (선택적, 제공되지 않으면 AsyncStorage에서 로드)
 */
export async function getChallengeStatus(
  challenge: ChallengeData,
  calendarData?: Record<string, any>
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
 * 소비 기록 시 챌린지 알림 트리거
 * 소비 기록이 저장될 때 호출하여 조건에 맞는 알림 발송
 */
export async function triggerChallengeNotifications(category: string, recordDate: Date): Promise<void> {
  try {
    // 1. 해당 카테고리의 활성 챌린지 찾기
    const challenge = await getActiveChallengeByCategory(category, recordDate);
    if (!challenge) {
      return;
    }

    // 2. 챌린지 상태 계산
    const status = await getChallengeStatus(challenge);
    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isEndedByToday = today > endDate;
    
    // 3. 알림 조건 체크 및 발송
    
    // 3-1. 진행현황 알림 (10%, 30%, 50%, 70%, 90%)
    // 챌린지가 종료된 이후에는 진행현황 알림을 더 이상 스케줄링하지 않음
    if (!isEndedByToday) {
      // 기존 진행현황 알림 모두 취소 (같은 날 여러 마일스톤 지나가도 최종 상태만 발송)
      await cancelChallengeProgressNotifications(challenge.id);
      
      const milestones = [10, 30, 50, 70, 90];
      for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i];
        const max = i < milestones.length - 1 ? milestones[i + 1] : 100;
        const isInRange = status.percentage >= milestone && status.percentage < max;
        
        if (isInRange) {
          // 현재 소비율이 마일스톤 범위 내에 있으면 알림 스케줄링
          await notifyChallengeProgress(challenge.category, status.percentage, challenge.id, milestone);
          break; // 한 번에 하나의 마일스톤만
        }
      }
    }
    
    // 3-2. 결과 알림 (성공 / 실패) - 챌린지당 최대 1회
    const successKey = `challenge_success_${challenge.id}`;
    const failureKey = `challenge_failure_${challenge.id}`;
    const [successSent, failureSent] = await Promise.all([
      AsyncStorage.getItem(successKey),
      AsyncStorage.getItem(failureKey),
    ]);
    
    const hasResultScheduled = !!successSent || !!failureSent;
    
    // 챌린지가 아직 종료되지 않았고, 성공/실패 알림이 한 번도 잡히지 않은 경우에만 스케줄링
    if (!isEndedByToday && !hasResultScheduled) {
      if (status.percentage > 100) {
        // 실패 조건: 소비율 100% 초과
        // 실패 알림 발송 전, 기존 성공 알림 취소
        await cancelChallengeSuccessNotification(challenge.id);
        await notifyChallengeFailure(challenge.category, status.percentage, challenge.id, endDate);
      } else {
        // 성공 조건: 소비율 100% 이하
        await notifyChallengeSuccess(
          challenge.category,
          status.percentage,
          challenge.id,
          endDate
        );
      }
    }

  } catch (error) {
  }
}

/**
 * 활성 챌린지의 누락된 알림 체크 및 발송 (앱 시작 시 실행)
 * 이미 저장된 소비 기록이 있어도 알림이 누락된 경우 보완
 */
export async function checkActiveChallengesNotifications(): Promise<void> {
  try {
    const challenges = await getAllChallenges();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // ✅ 성능 최적화: calendarData를 한 번만 로드하여 재사용
    const storedData = await AsyncStorage.getItem('calendarData');
    const calendarData = storedData ? JSON.parse(storedData) : {};
    
    // 1단계: 스케줄된 모든 챌린지 알림 확인 및 취소
    // getAllChallenges()에 없는 챌린지의 알림도 정리하기 위해 스케줄된 알림을 직접 확인
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const progressNotifications = scheduledNotifications.filter(
      n => n.content.data?.type === 'challenge_progress'
    );
    const failureNotifications = scheduledNotifications.filter(
      n => n.content.data?.type === 'challenge_failure'
    );
    const successNotifications = scheduledNotifications.filter(
      n => n.content.data?.type === 'challenge_success'
    );
    
    // 스케줄된 알림의 challengeId 수집 (진행현황 + 실패 + 성공)
    const scheduledChallengeIds = new Set<string>();
    progressNotifications.forEach(n => {
      const challengeId = n.content.data?.challengeId;
      if (challengeId) {
        scheduledChallengeIds.add(challengeId);
      }
    });
    failureNotifications.forEach(n => {
      const challengeId = n.content.data?.challengeId;
      if (challengeId) {
        scheduledChallengeIds.add(challengeId);
      }
    });
    successNotifications.forEach(n => {
      const challengeId = n.content.data?.challengeId;
      if (challengeId) {
        scheduledChallengeIds.add(challengeId);
      }
    });
    
    // 모든 스케줄된 알림의 챌린지 ID에 대해 취소 실행
    for (const challengeId of scheduledChallengeIds) {
      await cancelChallengeProgressNotifications(challengeId);
      await cancelChallengeFailureNotification(challengeId);
      await cancelChallengeSuccessNotification(challengeId);
    }
    
    // 2단계: 활성 챌린지만 재스케줄링
    for (const challenge of challenges) {
      if (challenge.isDeleted) {
        continue;
      }

      const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
      const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
      
      // 활성 챌린지만 체크
      if (today < startDate || today > endDate) {
        continue;
      }
      
      // ✅ 성능 최적화: 캐시된 calendarData 재사용
      const status = await getChallengeStatus(challenge, calendarData);
      
      // ✅ 달성된 챌린지(100% 이상)는 진행현황 알림 불필요
      if (status.percentage >= 100) {
        // 실패 알림과 성공 알림만 체크하고 진행현황 알림은 건너뜀
      } else {
      // 진행현황 알림 체크 (10%, 30%, 50%, 70%, 90%)
      // 역순으로 체크하여 가장 높은 마일스톤부터 확인 (중복 방지)
      const milestones = [90, 70, 50, 30, 10];
      for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i];
        // 역순이므로 max는 이전 마일스톤 (또는 100)
        const max = i === 0 ? 100 : milestones[i - 1];
        // 현재 소비율이 마일스톤 범위 내에 있는지 확인 (triggerChallengeNotifications와 동일한 로직)
        const isInRange = status.percentage >= milestone && status.percentage < max;
        
        if (isInRange) {
            // notifyChallengeProgress() 함수 내부에서 alreadySent 체크를 하므로 여기서는 바로 호출
          await notifyChallengeProgress(challenge.category, status.percentage, challenge.id, milestone);
          // 한 번에 하나의 마일스톤만 처리 (triggerChallengeNotifications와 동일)
          break;
          }
        }
      }
      
      // 실패 알림 체크 (100% 초과)
      if (status.percentage > 100) {
        const sentKey = `challenge_failure_${challenge.id}`;
        const alreadySent = await AsyncStorage.getItem(sentKey);
        
        if (!alreadySent) {
          await notifyChallengeFailure(challenge.category, status.percentage, challenge.id, endDate);
        }
      }
      
      // 성공 알림 체크 (100% 이하)
      if (status.percentage <= 100) {
        await notifyChallengeSuccess(
          challenge.category,
          status.percentage,
          challenge.id,
          endDate
        );
      }
    }
  } catch (error) {
    console.error('[challenge-utils] Failed to check active challenges notifications:', error);
  }
}

/**
 * 종료된 챌린지의 성공 알림 체크 (일일 배치 작업용)
 * 앱 시작 시 또는 매일 특정 시간에 실행
 */
export async function checkEndedChallenges(): Promise<void> {
  try {
    const challenges = await getAllChallenges();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const challenge of challenges) {
      if (challenge.isDeleted) {
        continue;
      }

      const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
      endDate.setHours(0, 0, 0, 0);
      
      // 종료일이 어제인 챌린지만 체크 (종료일 다음날 알림 발송)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (endDate.getTime() === yesterday.getTime()) {
        const status = await getChallengeStatus(challenge);
        
        // 성공 조건: 소비율이 100% 이하
        if (status.percentage <= 100) {
          const sentKey = `challenge_success_${challenge.id}`;
          const alreadySent = await AsyncStorage.getItem(sentKey);
          
          if (!alreadySent) {
            await notifyChallengeSuccess(
              challenge.category,
              status.percentage,
              challenge.id,
              endDate
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('[challenge-utils] Failed to check ended challenges:', error);
  }
}

