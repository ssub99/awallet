/**
 * Challenge Utilities
 * 
 * Challenge calculation and notification trigger logic
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyChallengeFailure, notifyChallengeProgress, notifyChallengeSuccess } from './notification-scheduler';
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
 */
export async function calculateChallengeAmount(challenge: ChallengeData): Promise<number> {
  try {
    const storedData = await AsyncStorage.getItem('calendarData');
    if (!storedData) return 0;

    const calendarData = JSON.parse(storedData);
    let totalAmount = 0;

    const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));

    Object.entries(calendarData).forEach(([dateString, data]: [string, any]) => {
      if (data.records && Array.isArray(data.records)) {
        data.records.forEach((record: any) => {
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
 */
export async function getChallengeStatus(challenge: ChallengeData): Promise<ChallengeStatus> {
  const currentAmount = await calculateChallengeAmount(challenge);
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
    
    // 3. 알림 조건 체크 및 발송
    
    // 3-1. 진행현황 알림 (10%, 30%, 50%, 70%, 90%)
    const milestones = [10, 30, 50, 70, 90];
    for (const milestone of milestones) {
      const isInRange = status.percentage >= milestone && status.percentage < milestone + 5;
      
      if (isInRange) {
        // 현재 소비율이 마일스톤 ±5% 범위 내에 있으면 알림 고려
        const sentKey = `challenge_progress_${challenge.id}_${milestone}`;
        const alreadySent = await AsyncStorage.getItem(sentKey);
        
        if (!alreadySent) {
          await notifyChallengeProgress(challenge.category, status.percentage, challenge.id, milestone);
          // 알림 함수 내부에서 발송 기록 저장
          break; // 한 번에 하나의 마일스톤만
        }
      }
    }
    
    // 3-2. 실패 알림 (100% 첫 초과)
    if (status.percentage > 100) {
      const sentKey = `challenge_failure_${challenge.id}`;
      const alreadySent = await AsyncStorage.getItem(sentKey);
      
      if (!alreadySent) {
        await notifyChallengeFailure(challenge.category, status.percentage, challenge.id);
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
      
      // 챌린지 상태 계산
      const status = await getChallengeStatus(challenge);
      
      // 진행현황 알림 체크 (10%, 30%, 50%, 70%, 90%)
      // 역순으로 체크하여 가장 높은 마일스톤부터 확인 (중복 방지)
      const milestones = [90, 70, 50, 30, 10];
      for (const milestone of milestones) {
        // 현재 소비율이 마일스톤 범위 내에 있는지 확인 (triggerChallengeNotifications와 동일한 로직)
        const isInRange = status.percentage >= milestone && status.percentage < milestone + 5;
        
        if (isInRange) {
          const sentKey = `challenge_progress_${challenge.id}_${milestone}`;
          const alreadySent = await AsyncStorage.getItem(sentKey);
          
          if (!alreadySent) {
            await notifyChallengeProgress(challenge.category, status.percentage, challenge.id, milestone);
            // 한 번에 하나의 마일스톤만 처리 (triggerChallengeNotifications와 동일)
            break;
          } else {
            // 이미 발송된 경우에도 break (더 낮은 마일스톤은 체크하지 않음)
            break;
          }
        }
      }
      
      // 실패 알림 체크 (100% 초과)
      if (status.percentage > 100) {
        const sentKey = `challenge_failure_${challenge.id}`;
        const alreadySent = await AsyncStorage.getItem(sentKey);
        
        if (!alreadySent) {
          await notifyChallengeFailure(challenge.category, status.percentage, challenge.id);
        }
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

