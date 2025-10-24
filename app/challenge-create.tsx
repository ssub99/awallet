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
import { EXPENSE_CATEGORIES } from '@/constants/categories';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface ChallengeData {
  id: string;
  category: string;
  startDate: string; // YYYY.MM.DD
  endDate: string; // YYYY.MM.DD
  targetAmount: number;
  createdAt: number;
  recurringId: string; // 반복 챌린지의 그룹 ID
}

export default function ChallengeCreateScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ 
    category?: string;
    selectedDate?: string;
  }>();

  // 실제 현재 날짜 (개발자 모드 오버라이드와 분리)
  const realCurrentDate = {
    getFullYear: () => 2025,
    getMonth: () => 9, // 10월 (0부터 시작)
    getDate: () => 21,
    getTime: () => new Date(2025, 9, 21).getTime()
  };

  // Form state
  // 캘린더에서 선택한 날짜의 일자 저장
  const selectedDay = params.selectedDate 
    ? new Date(params.selectedDate).getDate()
    : realCurrentDate.getDate();

  // Form state
  const [startYear, setStartYear] = useState<number>(() => {
    if (params.selectedDate) {
      return new Date(params.selectedDate).getFullYear();
    }
    return realCurrentDate.getFullYear();
  });
  
  const [startMonth, setStartMonth] = useState<number>(() => {
    if (params.selectedDate) {
      return new Date(params.selectedDate).getMonth() + 1; // 1-based
    }
    return realCurrentDate.getMonth() + 1;
  });
  
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringMonths, setRecurringMonths] = useState<number>(1);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState<boolean>(false);
  const [showRecurringMonthsPicker, setShowRecurringMonthsPicker] = useState<boolean>(false);
  const [monthStartDay, setMonthStartDay] = useState<number>(1);
  
  // 시작일 계산 (년월은 사용자 선택, 일자는 캘린더 선택값 유지)
  // 유효한 날짜인지 확인하고 조정
  const startDate = useMemo(() => {
    // 해당 월의 마지막 날짜 확인
    const lastDayOfMonth = new Date(startYear, startMonth, 0).getDate();
    const validDay = Math.min(selectedDay, lastDayOfMonth);
    
    if (validDay !== selectedDay) {

    }
    
    return `${startYear}.${String(startMonth).padStart(2, '0')}.${String(validDay).padStart(2, '0')}`;
  }, [startYear, startMonth, selectedDay]);
  
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

  const handleConfirm = async () => {

    // 필수값 검증
    if (!params.category) {

      return;
    }
    
    if (!targetAmount || targetAmount === '0' || targetAmount.trim() === '') {

      return;
    }
    
    const targetAmountNum = parseFloat(targetAmount.replace(/,/g, ''));
    const monthsToCreate = isRecurring ? recurringMonths : 1;

    try {
      // 기존 챌린지 데이터 가져오기
      const storedData = await AsyncStorage.getItem('challengeData');
      const challenges: ChallengeData[] = storedData ? JSON.parse(storedData) : [];

      // recurringId 생성 (부모 챌린지의 ID)
      const recurringId = `${realCurrentDate.getTime()}_${Math.random().toString(36).substr(2, 9)}`;

      // 반복 개월 수만큼 챌린지 생성
      const newChallenges: ChallengeData[] = [];
      
      for (let i = 0; i < monthsToCreate; i++) {
        // 각 월의 시작일과 종료일 계산 (월 시작일 기준)
        const [startYear, startMonth] = startDate.split('.').map(Number);
        
        // 현재 월 + i의 월 시작일 계산
        const currentMonthStart = new Date(startYear, startMonth - 1 + i, monthStartDay);
        const challengeStartYear = currentMonthStart.getFullYear();
        const challengeStartMonth = currentMonthStart.getMonth() + 1;
        const challengeStartDay = currentMonthStart.getDate();
        
        // 다음 월의 시작일 전날이 종료일
        const nextMonthStart = new Date(startYear, startMonth + i, monthStartDay);
        const challengeEndDate = new Date(nextMonthStart.getTime() - 24 * 60 * 60 * 1000);
        const challengeEndYear = challengeEndDate.getFullYear();
        const challengeEndMonth = challengeEndDate.getMonth() + 1;
        const challengeEndDay = challengeEndDate.getDate();
        
        const challengeStartDate = `${challengeStartYear}.${String(challengeStartMonth).padStart(2, '0')}.${String(challengeStartDay).padStart(2, '0')}`;
        const challengeEndDateStr = `${challengeEndYear}.${String(challengeEndMonth).padStart(2, '0')}.${String(challengeEndDay).padStart(2, '0')}`;

        const challengeData: ChallengeData = {
          id: i === 0 ? recurringId : `${realCurrentDate.getTime()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
          category: params.category,
          startDate: challengeStartDate,
          endDate: challengeEndDateStr,
          targetAmount: targetAmountNum,
          createdAt: realCurrentDate.getTime(),
          recurringId: recurringId, // 모든 챌린지가 같은 recurringId 공유
        };
        
        newChallenges.push(challengeData);

      }
      
      // 새 챌린지들을 기존 챌린지 배열에 추가
      const updatedChallenges = [...challenges, ...newChallenges];

      // AsyncStorage에 저장
      await AsyncStorage.setItem('challengeData', JSON.stringify(updatedChallenges));

      console.log('📋 [챌린지 생성] 생성된 챌린지 목록:', newChallenges.map(c => `${c.startDate}~${c.endDate}`).join(', '));
      
      // 챌린지 현황으로 이동

      router.back();
      
      setTimeout(() => {

        router.replace({
          pathname: '/monthly-expense-timeline',
          params: {
            year: realCurrentDate.getFullYear().toString(),
            month: (realCurrentDate.getMonth() + 1).toString(),
            tab: 'challenge'
          },
        });
      }, 100);
    } catch (error) {

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

              router.push({
                pathname: '/expense-category',
                params: { 
                  mode: 'challenge',
                  selectedDate: params.selectedDate,
                  selectedCategory: params.category
                }
              });
            }}>
              <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                <View style={styles.categoryRow}>
                  <Text style={[styles.categoryText, { color: colors.text }]}>
                    {params.category ? getCategoryWithEmoji(params.category) : '카테고리를 선택해주세요'}
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
            <View style={[styles.recurringCard, { backgroundColor: colors.staticWhite }]}>
              <View style={styles.recurringContent}>
                <View style={styles.recurringHeader}>
                  <View style={styles.recurringLabelContainer}>
                    <Text style={[styles.recurringLabel, { color: colors.text }]}>
                      챌린지 반복 여부
                    </Text>
                  </View>
                  <Switch
                    value={isRecurring}
                    onValueChange={(value) => {

                      setIsRecurring(value);
                    }}
                  />
                </View>
                <View style={styles.recurringDescription}>
                  <Text style={[styles.recurringDescriptionText, { color: colors.textAssistive }]}>
                    동일한 챌린지를 설정한 기간 동안 지속합니다.
                  </Text>
                </View>
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
            { label: '1개월', value: 1 },
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
  recurringCard: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recurringContent: {
    gap: 0,
  },
  recurringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 32,
  },
  recurringLabelContainer: {
    flex: 1,
  },
  recurringLabel: {
    ...Typography.body1.l.regular,
  },
  recurringDescription: {
    marginTop: 0,
  },
  recurringDescriptionText: {
    ...Typography.body2.r.regular,
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
