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
import { getCustomMonthInfo } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { monthStartEvent } from '@/hooks/use-month-start';
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
      console.log('🔄 챌린지 재생성 시작:', { newMonthStartDay });
      
      // 기존 챌린지 데이터 로드
      const storedChallengeData = await AsyncStorage.getItem('challengeData');
      const existingChallenges = storedChallengeData ? JSON.parse(storedChallengeData) : [];
      console.log('📋 기존 챌린지 개수:', existingChallenges.length);
      
      // 기존 챌린지가 없으면 재생성하지 않음
      if (existingChallenges.length === 0) {
        console.log('📝 기존 챌린지 데이터 없음 - 재생성 건너뜀');
        return;
      }
      
      // 기존 챌린지들을 카테고리별로 그룹화
      const challengeGroups = new Map<string, any[]>();
      
      existingChallenges.forEach((challenge: any) => {
        if (!challengeGroups.has(challenge.category)) {
          challengeGroups.set(challenge.category, []);
        }
        challengeGroups.get(challenge.category)!.push(challenge);
      });
      
      // 새로운 챌린지들 생성
      const newChallenges: any[] = [];
      const today = new Date();
      
      // 오늘 날짜가 속하는 커스텀 월 정보 계산
      const customMonthInfo = getCustomMonthInfo(today, newMonthStartDay);
      const baseYear = customMonthInfo.year;
      const baseMonth = customMonthInfo.month;
      
      console.log('📅 기준 커스텀 월:', { baseYear, baseMonth, today: today.toISOString().split('T')[0] });
      
      for (const [category, challenges] of challengeGroups) {
        // 해당 카테고리의 첫 번째 챌린지에서 목표 금액과 반복 개월 수 가져오기
        const firstChallenge = challenges[0];
        const targetAmount = firstChallenge.targetAmount;
        const recurringMonths = challenges.length;
        
        console.log(`🔄 ${category} 챌린지 재생성:`, {
          targetAmount,
          recurringMonths,
          newMonthStartDay,
          baseYear,
          baseMonth
        });
        
        // 새로운 recurringId 생성
        const newRecurringId = `${today.getTime()}_${Math.random().toString(36).substr(2, 9)}`;
        
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
          
          const newChallenge = {
            id: i === 0 ? newRecurringId : `${today.getTime()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
            category: category,
            startDate: challengeStartDate,
            endDate: challengeEndDateStr,
            targetAmount: targetAmount,
            createdAt: today.getTime(),
            recurringId: newRecurringId,
          };
          
          newChallenges.push(newChallenge);
          
          console.log(`✅ ${category} 챌린지 ${i + 1} 생성:`, {
            startDate: challengeStartDate,
            endDate: challengeEndDateStr
          });
        }
      }
      
      // 새로운 챌린지들 저장
      await AsyncStorage.setItem('challengeData', JSON.stringify(newChallenges));
      
      console.log('🎉 챌린지 재생성 완료:', {
        기존개수: existingChallenges.length,
        새개수: newChallenges.length
      });
      
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
      } catch (error) {

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
          console.log('✅ 월 시작일 저장 (자동):', selectedDay);
          
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
    console.log('📅 월 시작일 선택:', day, '(저장 대기 중)');
  };

  const handleBack = async () => {
    // 변경이 있으면 저장
    if (selectedDay !== initialDay) {
      try {
        await AsyncStorage.setItem('monthStartDay', `${selectedDay}일`);
        console.log('✅ 월 시작일 저장:', selectedDay);
        
        // 월 시작일이 변경되었을 때만 챌린지 재생성
        await regenerateChallengesForNewMonthStart(selectedDay);
        // Emit month start change
        monthStartEvent.emit(selectedDay);
        
      } catch (error) {
        console.error('❌ 월 시작일 저장 중 오류:', error);
      }
    } else {
      console.log('📝 월 시작일 변경 없음');
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

