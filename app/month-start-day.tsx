/**
 * Month Start Day Selection Screen
 * 
 * Allows users to select which day of the month should be considered
 * as the start of the month for calculations and displays
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { monthStartEvent } from '@/hooks/use-month-start';
import { createChallenges, getAllChallenges, softDeleteChallengesByRecurringId, type ChallengeRecord } from '@/utils/challenges';
import { getCustomMonthInfo } from '@/utils/custom-month';
import { generateGroupId, generateRecordId } from '@/utils/id-generator';
import { getChallengeStatus } from '@/utils/challenge-utils';
import { cancelChallengeSuccessNotification, notifyChallengeSuccess, notifyChallengeProgress, notifyChallengeFailure, cancelChallengeProgressNotifications } from '@/utils/notification-scheduler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MonthStartDayScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const navigation = useNavigation();
  
  const [selectedDay, setSelectedDay] = useState(1);
  const [initialDay, setInitialDay] = useState(1); // 원래 값 저장
  const scrollRef = useRef<ScrollView>(null);
  const [viewportHeight, setViewportHeight] = useState(0);

  // 챌린지 재생성 로직
  const regenerateChallengesForNewMonthStart = async (newMonthStartDay: number) => {
    try {
      // 기존 챌린지 데이터 로드
      const existingChallenges = await getAllChallenges();
      const activeChallenges = existingChallenges.filter((challenge) => !challenge.isDeleted);
      
      // 기존 챌린지가 없으면 재생성하지 않음
      if (activeChallenges.length === 0) {
        return;
      }
      
      // 기존 챌린지들을 카테고리별로 그룹화
      const challengeGroups = new Map<string, ChallengeRecord[]>();
      
      activeChallenges.forEach((challenge: ChallengeRecord) => {
        if (!challengeGroups.has(challenge.category)) {
          challengeGroups.set(challenge.category, []);
        }
        challengeGroups.get(challenge.category)!.push(challenge);
      });
      
      // 기존 챌린지들의 성공 알림 취소 (soft delete 전에 수행)
      for (const challenge of activeChallenges) {
        await cancelChallengeSuccessNotification(challenge.id);
      }
      
      // 기존 챌린지들 비활성화 (soft delete) - 단일 트랜잭션으로 처리
      const recurringIds = new Set<string>();
      activeChallenges.forEach((challenge) => {
        if (challenge.recurringId) {
          recurringIds.add(challenge.recurringId);
        }
      });

      if (recurringIds.size > 0) {
        // 단일 트랜잭션으로 모든 soft delete 처리 (race condition 방지)
        const allChallenges = await getAllChallenges();
        const deletedAt = new Date().toISOString();
        const updatedChallenges = allChallenges.map((challenge) => {
          if (challenge.recurringId && recurringIds.has(challenge.recurringId)) {
            return {
              ...challenge,
              isDeleted: true,
              deletedAt: deletedAt,
              updatedAt: Date.now(),
            };
          }
          return challenge;
        });
        
        const CHALLENGE_STORAGE_KEY = 'challengeData';
        const sorted = [...updatedChallenges].sort((a, b) => a.startDate.localeCompare(b.startDate));
        await AsyncStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(sorted));
      }
      
      // 새로운 챌린지들 생성
      const newChallenges: ChallengeRecord[] = [];

      for (const [category, challenges] of challengeGroups) {
        // 시작월 계산을 위해 시작일 기준 오름차순 정렬
        const sortedChallenges = [...challenges].sort((a, b) => a.startDate.localeCompare(b.startDate));
        // 해당 카테고리의 첫 번째 챌린지에서 목표 금액과 반복 개월 수 가져오기
        const firstChallenge = sortedChallenges[0];
        const targetAmount = firstChallenge.targetAmount;
        const recurringMonths = sortedChallenges.length;

        // 원본 앵커(startDate 유지) 기준으로 새 월 시작일에 맞춘 커스텀 월 계산
        const anchorDateStr = firstChallenge.anchorStartDate ?? firstChallenge.startDate;
        const anchorDate = new Date(anchorDateStr.replace(/\./g, '-'));
        const { year: baseYear, month: baseMonth } = getCustomMonthInfo(anchorDate, newMonthStartDay);

        // 새로운 recurringId 생성 (그룹 식별자)
        const newRecurringId = generateGroupId('recurring');
        
        // 오늘 날짜가 속하는 커스텀 월을 기준으로 챌린지들 생성
        for (let i = 0; i < recurringMonths; i++) {
          // 기준 커스텀 월 + i의 월 시작일 계산
          const currentMonthStart = new Date(baseYear, baseMonth - 1 + i, newMonthStartDay);
          const challengeStartYear = currentMonthStart.getFullYear();
          const challengeStartMonth = currentMonthStart.getMonth() + 1;
          const challengeStartDay = currentMonthStart.getDate();
          
          // 다음 월의 시작일 전날이 종료일
          const nextMonthStart = new Date(baseYear, baseMonth - 1 + i + 1, newMonthStartDay);
          const challengeEndDate = new Date(nextMonthStart.getTime() - 24 * 60 * 60 * 1000);
          const challengeEndYear = challengeEndDate.getFullYear();
          const challengeEndMonth = challengeEndDate.getMonth() + 1;
          const challengeEndDay = challengeEndDate.getDate();
          
          const challengeStartDate = `${challengeStartYear}.${String(challengeStartMonth).padStart(2, '0')}.${String(challengeStartDay).padStart(2, '0')}`;
          const challengeEndDateStr = `${challengeEndYear}.${String(challengeEndMonth).padStart(2, '0')}.${String(challengeEndDay).padStart(2, '0')}`;
          
          const startMonthLabel = `${challengeStartYear}.${String(challengeStartMonth).padStart(2, '0')}`;
          const endMonthLabel = `${challengeEndYear}.${String(challengeEndMonth).padStart(2, '0')}`;
          const durationMonths = sortedChallenges.length;

          const now = Date.now();

          const newChallenge: ChallengeRecord = {
            id: generateRecordId(), // 각 챌린지마다 고유한 UUID
            category: category,
            startDate: challengeStartDate,
            endDate: challengeEndDateStr,
            anchorStartDate: anchorDateStr, // 원본 앵커 유지
            targetAmount: targetAmount,
            createdAt: now,
            recurringId: newRecurringId,
            isDeleted: false,
            deletedAt: null,
            startMonth: startMonthLabel,
            endMonth: endMonthLabel,
            durationMonths,
            status: 'active',
            updatedAt: now,
          };
          
          newChallenges.push(newChallenge);
        }
      }

      if (newChallenges.length > 0) {
        await createChallenges(newChallenges);
        
        // 각 새 챌린지에 대해 알림 스케줄링
        for (const challenge of newChallenges) {
          try {
            const status = await getChallengeStatus(challenge);
            const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
            endDate.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isEndedByToday = today > endDate;
            
            // 기존 진행현황 알림 모두 취소 (중복 방지)
            // 챌린지 종료 이후에는 진행현황 알림을 스케줄하지 않음
            if (!isEndedByToday) {
              await cancelChallengeProgressNotifications(challenge.id);
              
              // 진행현황 알림 스케줄링 (10%, 30%, 50%, 70%, 90%)
              const milestones = [10, 30, 50, 70, 90];
              for (let i = 0; i < milestones.length; i++) {
                const milestone = milestones[i];
                const max = i < milestones.length - 1 ? milestones[i + 1] : 100;
                const isInRange = status.percentage >= milestone && status.percentage < max;
                
                if (isInRange) {
                  await notifyChallengeProgress(challenge.category, status.percentage, challenge.id, milestone);
                  break; // 한 번에 하나의 마일스톤만
                }
              }
            }
            
            // 실패 알림 스케줄링 (100% 초과)
            if (status.percentage > 100) {
              await notifyChallengeFailure(challenge.category, status.percentage, challenge.id, endDate);
            }
            
            // 성공 알림 스케줄링 (≤ 100%)
            if (status.percentage <= 100) {
              await notifyChallengeSuccess(
                challenge.category,
                status.percentage,
                challenge.id,
                endDate
              );
            }
          } catch (error) {
            console.error('[month-start-day] Failed to schedule notifications:', error);
          }
        }
      }
      
      // 4. soft delete된 챌린지들을 하드 삭제 (찌꺼기 정리)
      const allChallengesAfterCreation = await getAllChallenges();
      const filteredActiveChallenges = allChallengesAfterCreation.filter(
        (challenge) => challenge.isDeleted !== true
      );
      
      // soft delete된 챌린지가 있으면 활성 챌린지만 저장 (하드 삭제)
      if (filteredActiveChallenges.length !== allChallengesAfterCreation.length) {
        const CHALLENGE_STORAGE_KEY = 'challengeData';
        const sorted = [...filteredActiveChallenges].sort((a, b) => a.startDate.localeCompare(b.startDate));
        await AsyncStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(sorted));
      }
      
    } catch (error) {
      console.error('❌ 챌린지 재생성 중 오류:', error);
    }
  };

  // Load saved month start day
  useEffect(() => {
    const loadMonthStartDay = async () => {
      try {
        const saved = await AsyncStorage.getItem('monthStartDay');
        if (saved) {
          // Extract number from saved value (e.g., "1일" -> 1)
          const dayNumber = parseInt(saved.replace('일', ''));
          if (!isNaN(dayNumber) && dayNumber >= 1 && dayNumber <= 31) {
            setSelectedDay(dayNumber);
            setInitialDay(dayNumber); // 초기값도 저장
          }
        }
      } catch {

      }
    };

    loadMonthStartDay();
  }, []);

  // 선택된 일자를 화면 중앙으로 스크롤
  useEffect(() => {
    if (!viewportHeight || !scrollRef.current || !selectedDay) return;
    // 행 높이(대략): 최소 56
    const rowHeight = 56;
    const dividerHeight = 1; // 마지막 제외
    const index = Math.max(0, Math.min(30, selectedDay - 1));
    const y = Math.max(0, index * (rowHeight + dividerHeight) - (viewportHeight - rowHeight) / 2);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
    });
  }, [viewportHeight, selectedDay]);

  // Save on screen exit (hardware back button or gesture)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', async (e) => {
      // 변경이 있으면 저장
      if (selectedDay !== initialDay) {
        try {
          await AsyncStorage.setItem('monthStartDay', `${selectedDay}일`);
          
          // 월 시작일이 변경되었을 때만 챌린지 재생성
          await regenerateChallengesForNewMonthStart(selectedDay);
          // Emit month start change
          monthStartEvent.emit(selectedDay);
        } catch (error) {
          console.error('❌ 월 시작일 저장 중 오류:', error);
        }
      }
    });

    return unsubscribe;
  }, [navigation, selectedDay, initialDay]);

  const handleDaySelect = (day: number) => {
    setSelectedDay(day);
  };

  const handleBack = async () => {
    // 변경이 있으면 저장
    if (selectedDay !== initialDay) {
      try {
        await AsyncStorage.setItem('monthStartDay', `${selectedDay}일`);
        
        // 월 시작일이 변경되었을 때만 챌린지 재생성
        await regenerateChallengesForNewMonthStart(selectedDay);
        // Emit month start change
        monthStartEvent.emit(selectedDay);
        
      } catch (error) {
        console.error('❌ 월 시작일 저장 중 오류:', error);
      }
    } else {
    }
    
    router.back();
  };

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.staticWhite }]} 
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Top Navigation */}
      <TopNavigation
        type="sub"
        title="월 시작일"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      {/* Content */}
      <View style={[styles.contentWrapper, { backgroundColor: colors.fill }]}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          ref={scrollRef}
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        >
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day, index) => (
              <View key={day}>
                <Pressable
                  style={styles.dayRow}
                  onPress={() => handleDaySelect(day)}
                  accessibilityRole="button"
                  accessibilityLabel={`${day}일 선택`}
                  accessibilityState={{ selected: selectedDay === day }}
                >
                  <Text style={[styles.dayText, { color: colors.text }]}>
                    {day}일
                  </Text>
                  
                  {selectedDay === day && (
                    <Icon name="check" size={24} color={colors.primary} />
                  )}
                </Pressable>
                
                {index < 30 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
  },
  dayText: {
    ...Typography.body1.l.regular,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
});

