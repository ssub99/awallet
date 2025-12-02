/**
 * Challenge Create Screen
 * 
 * Screen for creating a new challenge.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Toast } from '@/components/ui/toast';
import { EXPENSE_CATEGORIES } from '@/constants/categories';
import { Colors, Typography } from '@/constants/theme';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { getCustomMonthInfo } from '@/utils/custom-month';
import { createChallenges, getAllChallenges, type ChallengeRecord } from '@/utils/challenges';
import { generateRecordId, generateGroupId } from '@/utils/id-generator';
import { getChallengeStatus } from '@/utils/challenge-utils';
import { notifyChallengeSuccess, notifyChallengeProgress, notifyChallengeFailure, cancelChallengeProgressNotifications } from '@/utils/notification-scheduler';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ChallengeCreateScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setLoading } = useLoading();
  const params = useLocalSearchParams<{ 
    category?: string;
    selectedDate?: string;
    calendarYear?: string;
    calendarMonth?: string;
  }>();

  // Form state
  // 캘린더에서 선택한 날짜의 일자 저장
  const selectedDay = params.selectedDate 
    ? new Date(params.selectedDate).getDate()
    : new Date().getDate();

  // Form state
  const [startYear, setStartYear] = useState<number>(() => {
    // 현재 캘린더의 년도를 기본값으로 사용
    if (params.calendarYear) {
      return parseInt(params.calendarYear);
    }
    if (params.selectedDate) {
      return new Date(params.selectedDate).getFullYear();
    }
    return new Date().getFullYear();
  });
  
  const [startMonth, setStartMonth] = useState<number>(() => {
    // 현재 캘린더의 월을 기본값으로 사용
    if (params.calendarMonth) {
      return parseInt(params.calendarMonth);
    }
    if (params.selectedDate) {
      return new Date(params.selectedDate).getMonth() + 1; // 1-based
    }
    return new Date().getMonth() + 1;
  });

  // 현재 캘린더의 년/월을 기준으로 날짜 설정
  const realCurrentDate = useMemo(() => ({
    getFullYear: () => startYear,
    getMonth: () => startMonth - 1, // 0부터 시작하므로 -1
    getDate: () => selectedDay,
    getTime: () => new Date(startYear, startMonth - 1, selectedDay).getTime()
  }), [startYear, startMonth, selectedDay]);
  
  // 카테고리 state (params.category를 초기값으로 사용)
  const [category, setCategory] = useState<string>(params.category || '');
  
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringMonths, setRecurringMonths] = useState<number>(2);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState<boolean>(false);
  const [showRecurringMonthsPicker, setShowRecurringMonthsPicker] = useState<boolean>(false);
  const [monthStartDay, setMonthStartDay] = useState<number>(1);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // 카테고리 선택 화면에서 돌아올 때 카테고리 업데이트
  useFocusEffect(
    useCallback(() => {
      const updateCategory = async () => {
        try {
          // AsyncStorage에서 선택된 카테고리 확인 (카테고리 선택 화면에서 돌아온 경우)
          const selectedCategoryFromStorage = await AsyncStorage.getItem('selectedCategory');
          
          if (selectedCategoryFromStorage) {
            setCategory(selectedCategoryFromStorage);
            // 사용 후 AsyncStorage에서 제거
            await AsyncStorage.removeItem('selectedCategory');
          }
        } catch (error) {
          console.error('[챌린지 생성] 카테고리 업데이트 중 오류:', error);
        }
      };
      
      updateCategory();
    }, [])
  );
  
  // 시작일 계산 메모 값은 사용하지 않아 제거 (lint 정리)
  
  // 년/월 선택 옵션 생성 (현재 년도 기준 ±10년)
  const yearOptions = Array.from({ length: 21 }, (_, i) => {
    const year = realCurrentDate.getFullYear() - 10 + i;
    return { label: `${year}년`, value: year };
  });
  
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return { label: `${month}월`, value: month };
  });

  // 화면 로드 시 초기 상태 로그
  useEffect(() => {
    const loadMonthStart = async () => {
      const monthStart = await loadMonthStartDay();
      setMonthStartDay(monthStart);

    };
    
    loadMonthStart();
  }, []);
  
  // 초기 로드 시 params.category를 state에 설정
  useEffect(() => {
    if (params.category) {
      setCategory(params.category);
    }
  }, [params.category]);

  // 금액 입력 시 소수점 제거하는 함수
  const handleAmountChange = (text: string) => {

    // 숫자만 추출 (콤마는 제거 후 다시 추가)
    const numbersOnly = text.replace(/[^0-9]/g, '');
    
    // 숫자가 있으면 콤마 포맷팅 적용
    if (numbersOnly) {
      const formattedAmount = Number(numbersOnly).toLocaleString();

      setTargetAmount(formattedAmount);
    } else {

      setTargetAmount('');
    }
  };

  // 카테고리명에 이모지 추가하는 함수
  const getCategoryWithEmoji = (categoryName: string) => {
    const category = EXPENSE_CATEGORIES.find(cat => cat.label === categoryName);
    return category ? `${category.emoji} ${categoryName}` : categoryName;
  };

  // 기간 겹침 체크 함수
  const isDateRangeOverlapping = (
    newStart: string,
    newEnd: string,
    existingStart: string,
    existingEnd: string
  ): boolean => {
    // 날짜 문자열을 비교 가능한 형식으로 변환 (YYYY.MM.DD 형식)
    const newStartDate = new Date(newStart.replace(/\./g, '-'));
    const newEndDate = new Date(newEnd.replace(/\./g, '-'));
    const existingStartDate = new Date(existingStart.replace(/\./g, '-'));
    const existingEndDate = new Date(existingEnd.replace(/\./g, '-'));
    
    // 두 기간이 겹치는지 확인: (newStart <= existingEnd && newEnd >= existingStart)
    return newStartDate <= existingEndDate && newEndDate >= existingStartDate;
  };

  const handleConfirm = async () => {
    // 필수값 검증
    if (!category) {
      setToastMessage('카테고리를 선택해 주세요.');
      setToastVisible(true);
      return;
    }
    
    if (!targetAmount || targetAmount === '0' || targetAmount.trim() === '') {
      return;
    }
    
    setLoading(true);
    try {
      const targetAmountNum = parseFloat(targetAmount.replace(/,/g, ''));
      const monthsToCreate = isRecurring ? recurringMonths : 1;
      
      // 사용자가 선택한 시작 년월을 기준으로 계산
      const baseYear = startYear;
      const baseMonth = startMonth;
      
      // 새로 생성하려는 챌린지들의 기간 계산
      const newChallenges: ChallengeRecord[] = [];
      
      for (let i = 0; i < monthsToCreate; i++) {
        // 선택한 시작 년월 + i의 월 시작일 계산
        const currentMonthStart = new Date(baseYear, baseMonth - 1 + i, monthStartDay);
        const challengeStartYear = currentMonthStart.getFullYear();
        const challengeStartMonth = currentMonthStart.getMonth() + 1;
        const challengeStartDay = currentMonthStart.getDate();
        
        // 다음 월의 시작일 전날이 종료일
        const nextMonthStart = new Date(baseYear, baseMonth + i, monthStartDay);
        const challengeEndDate = new Date(nextMonthStart.getTime() - 24 * 60 * 60 * 1000);
        const challengeEndYear = challengeEndDate.getFullYear();
        const challengeEndMonth = challengeEndDate.getMonth() + 1;
        const challengeEndDay = challengeEndDate.getDate();
        
        const challengeStartDate = `${challengeStartYear}.${String(challengeStartMonth).padStart(2, '0')}.${String(challengeStartDay).padStart(2, '0')}`;
        const challengeEndDateStr = `${challengeEndYear}.${String(challengeEndMonth).padStart(2, '0')}.${String(challengeEndDay).padStart(2, '0')}`;

        const startMonthLabel = `${challengeStartYear}.${String(challengeStartMonth).padStart(2, '0')}`;
        const endMonthLabel = `${challengeEndYear}.${String(challengeEndMonth).padStart(2, '0')}`;
        const durationMonths = monthsToCreate;

        const challengeData: ChallengeRecord = {
          id: generateRecordId(), // 각 챌린지마다 고유한 UUID
          category: category,
          startDate: challengeStartDate,
          endDate: challengeEndDateStr,
          targetAmount: targetAmountNum,
          createdAt: Date.now(),
          recurringId: '', // 임시로 빈 값 (아직 생성 전)
          isDeleted: false,
          deletedAt: null,
          startMonth: startMonthLabel,
          endMonth: endMonthLabel,
          durationMonths,
          status: 'active',
          updatedAt: Date.now(),
        };
        
        newChallenges.push(challengeData);
      }
      
      // 기존 챌린지 존재 여부 체크 (같은 카테고리)
      const existingChallenges = await getAllChallenges();
      const activeChallenges = existingChallenges.filter(
        (challenge) => 
          !challenge.isDeleted && 
          challenge.category === category
      );
      
      // 같은 카테고리의 활성 챌린지가 하나라도 존재하면 생성 불가
      if (activeChallenges.length > 0) {
        setToastMessage('선택하신 챌린지는 이미 생성되어 있습니다.');
        setToastVisible(true);
        setLoading(false);
        return;
      }
      
      // 중복이 없으면 recurringId 생성하고 챌린지 생성
      const recurringId = generateGroupId('recurring');
      newChallenges.forEach((challenge) => {
        challenge.recurringId = recurringId;
      });
      
      await createChallenges(newChallenges);
      
      // 각 챌린지에 대해 알림 스케줄링
      for (const challenge of newChallenges) {
        try {
          // 챌린지 상태 계산 (소비율 포함)
          const status = await getChallengeStatus(challenge);
          const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
          endDate.setHours(0, 0, 0, 0);
          
          // 기존 진행현황 알림 모두 취소 (중복 방지)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isEndedByToday = today > endDate;
          
          // 진행현황 알림 스케줄링 (10%, 30%, 50%, 70%, 90%)
          // 챌린지 종료 이후에는 진행현황 알림을 스케줄하지 않음
          if (!isEndedByToday) {
            await cancelChallengeProgressNotifications(challenge.id);
            
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
          console.error('[challenge-create] Failed to schedule notifications:', error);
        }
      }
      
      // 챌린지 현황으로 이동 (첫 번째 챌린지의 시작일이 속하는 년/월로 이동)
      const firstChallenge = newChallenges[0];
      const [targetYear, targetMonth] = firstChallenge.startDate.split('.').map(Number);

      router.back();
      
      setTimeout(() => {
        router.replace({
          pathname: '/monthly-expense-timeline',
          params: {
            year: targetYear.toString(),
            month: targetMonth.toString(),
            tab: 'challenge'
          },
        });
      }, 100);
    } catch (error) {
      console.error('[챌린지 생성] error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {

    router.back();
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
        <TopNavigation
          type="sub"
          title="챌린지 생성"
          showLeftIcon
          onLeftIconPress={handleBack}
        />

        <ScrollView 
          style={[styles.content, { backgroundColor: colors.fill }]}
          contentContainerStyle={styles.contentContainer}
        >
          {/* 카테고리 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              카테고리 <Text style={{ color: '#EF5252' }}>*</Text>
            </Text>
            <Pressable onPress={() => {
              // 사용자가 선택한 년/월/일 정보를 카테고리 선택 화면으로 전달
              // selectedDay는 사용자가 선택한 날짜의 일자이므로 그대로 사용
              const selectedDateStr = `${startYear}.${String(startMonth).padStart(2, '0')}.${String(selectedDay).padStart(2, '0')}`;
              
              router.push({
                pathname: '/expense-category',
                params: { 
                  mode: 'challenge',
                  selectedDate: selectedDateStr,
                  calendarYear: startYear.toString(),
                  calendarMonth: startMonth.toString(),
                  selectedCategory: category
                }
              });
            }}>
              <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                <View style={styles.categoryRow}>
                  <Text style={[styles.categoryText, { color: colors.text }]}>
                    {category ? getCategoryWithEmoji(category) : '카테고리를 선택해주세요'}
                  </Text>
                  <Icon name="arrowRight" variant="line" size={24} color={colors.text} />
                </View>
              </View>
            </Pressable>
          </View>

          {/* 시작 년월 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              시작 년월 <Text style={{ color: '#EF5252' }}>*</Text>
            </Text>
            <Pressable onPress={() => {

              setShowYearMonthPicker(true);
            }}>
              <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                <View style={styles.yearMonthRow}>
                  <View style={styles.yearMonthLeft}>
                    <Icon name="calendarMonth" variant="line" size={24} color={colors.text} />
                    <Text style={[styles.yearMonthText, { color: colors.text }]}>
                      {startYear}.{String(startMonth).padStart(2, '0')}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </View>

          {/* 목표 소비 금액 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              목표 소비 금액 <Text style={{ color: '#EF5252' }}>*</Text>
            </Text>
            <Input
              variant="line"
              inputType="number"
              unit="원"
              value={targetAmount}
              onChangeText={handleAmountChange}
              keyboardType="numeric"
              placeholder="0"
              textAlign="right"
            />
          </View>

          {/* 반복 설정 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              반복 설정
            </Text>
            <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
              <View style={styles.recurringSection}>
                <View style={styles.recurringTitleRow}>
                  <Text style={[styles.switchLabel, { color: colors.text }]}>
                    챌린지 반복 여부
                  </Text>
                  <Switch
                    value={isRecurring}
                    onValueChange={(value) => {

                      setIsRecurring(value);
                    }}
                  />
                </View>
                <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                  동일한 챌린지를 설정한 기간 동안 지속합니다.
                </Text>
              </View>
            </View>
          </View>

          {/* 개월 수 */}
          {isRecurring && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                개월 수
              </Text>
              <Pressable onPress={() => {

                setShowRecurringMonthsPicker(true);
              }}>
                <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                  <View style={styles.monthPickerRow}>
                    <Text style={[styles.monthPickerPlaceholder, { color: colors.text }]}>
                      시작 년월 부터 반복할 개월 수
                    </Text>
                    <View style={styles.monthPickerValue}>
                      <Text style={[styles.monthPickerValueText, { color: colors.textAssistive }]}>
                        {recurringMonths}개월
                      </Text>
                      <Icon name="arrowRight" variant="line" size={24} color={colors.text} />
                    </View>
                  </View>
                </View>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* 하단 고정 버튼 */}
        <View style={[
          styles.bottomButtonContainer, 
          { 
            backgroundColor: colors.staticWhite,
            paddingBottom: 16 + insets.bottom 
          }
        ]}>
          <Button onPress={handleConfirm}>
            확인
          </Button>
        </View>

        {/* 시작 년월 선택 피커 */}
        <DatePicker
          visible={showYearMonthPicker}
          onClose={() => setShowYearMonthPicker(false)}
          title="시작 년월"
          yearOptions={yearOptions}
          selectedYear={startYear}
          onYearChange={(year) => {

            setStartYear(year);
          }}
          monthOptions={monthOptions}
          selectedMonth={startMonth}
          onMonthChange={(month) => {

            setStartMonth(month);
          }}
        />

        {/* 개월 수 선택 피커 */}
        <DatePicker
          visible={showRecurringMonthsPicker}
          onClose={() => setShowRecurringMonthsPicker(false)}
          title="반복할 개월 수"
          dayOptions={[
            { label: '2개월', value: 2 },
            { label: '3개월', value: 3 },
            { label: '4개월', value: 4 },
            { label: '5개월', value: 5 },
            { label: '6개월', value: 6 },
          ]}
          selectedDay={recurringMonths}
          onDayChange={(value) => {

            setRecurringMonths(value);
          }}
        />

        <Toast
          visible={toastVisible}
          message={toastMessage}
          onHide={() => setToastVisible(false)}
        />

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 24,
    paddingBottom: 24,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    ...Typography.body1.l.bold,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(144, 146, 158, 0.16)',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 12,
  },
  categoryText: {
    ...Typography.body1.l.regular,
  },
  yearMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
  },
  yearMonthLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yearMonthText: {
    ...Typography.body1.l.regular,
  },
  recurringSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recurringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  switchLabel: {
    ...Typography.body1.l.regular,
  },
  recurringCaption: {
    ...Typography.body2.r.regular,
    marginTop: 0,
  },
  monthPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 12,
  },
  monthPickerPlaceholder: {
    ...Typography.body1.l.regular,
  },
  monthPickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthPickerValueText: {
    ...Typography.body1.l.regular,
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});
