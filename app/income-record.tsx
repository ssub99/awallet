/**
 * Income Record Screen
 * 
 * Screen for recording income/deposit transactions.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CalendarDaySelect } from '@/components/ui/calendar-day-select';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Colors, Typography } from '@/constants/theme';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { getCustomMonthInfo } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calendarRefreshEvent } from '@/hooks/calendar-events';
import { createIncome, type IncomeRecord as IncomeRecordType } from '@/utils/incomes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, InteractionManager, Keyboard, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 요일 계산 함수
 */
function getDayOfWeekLabel(year: number, month: number, day: number): string {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(year, month - 1, day);
  return weekdays[date.getDay()];
}

export default function IncomeRecordScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const navigation = useNavigation();
  interface GoHomeOptions {
    year: number;
    month: number;
    targetDate: string;
    refresh?: boolean;
  }

  const goHomeWithFocus = useCallback(
    async ({ year, month, targetDate, refresh = true }: GoHomeOptions) => {
      try {
        await AsyncStorage.setItem('pendingCalendarTarget', JSON.stringify({ year, month, targetDate }));
      } catch (error) {
        console.warn('[income-record] Failed to store pending target:', error);
      }

      (navigation as any).reset({
        index: 0,
        routes: [
          {
            name: '(tabs)',
            params: {
              screen: 'home',
              params: {
                targetYear: year.toString(),
                targetMonth: month.toString(),
                targetDate,
                periodType: 'month',
              },
            },
          },
        ],
      });

      if (refresh) {
        InteractionManager.runAfterInteractions(() => {
          calendarRefreshEvent.emit();
        });
      }
    },
    [navigation]
  );
  const insets = useSafeAreaInsets();
  const { setLoading } = useLoading();
  const params = useLocalSearchParams<{ 
    selectedDate?: string;
    calendarYear?: string;
    calendarMonth?: string;
  }>();

  // 디버깅용 로그

  // Form state
  const today = new Date();
  const formattedToday = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  
  // 선택된 날짜가 있으면 해당 날짜를 사용, 없으면 오늘 날짜 사용
  const getInitialDate = () => {
    if (params.selectedDate) {
      // "2025-01-15" 형식을 "2025.01.15" 형식으로 변환
      const convertedDate = params.selectedDate.replace(/-/g, '.');

      return convertedDate;
    }

    return formattedToday;
  };
  
  const [amount, setAmount] = useState<string>('');
  
  // 금액 입력 시 처리하는 함수 (Input 컴포넌트에서 이미 포맷팅됨)
  const handleAmountChange = (text: string) => {
    // Input 컴포넌트에서 이미 콤마 포맷팅이 적용되어 있으므로 그대로 사용
    setAmount(text);
  };
  const [date, setDate] = useState<string>(getInitialDate());
  const [memo, setMemo] = useState<string>('');
  const [monthStartDay, setMonthStartDay] = useState(1);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<string>(date.replace(/\./g, '-'));
  
  // 월 시작일 로드
  useEffect(() => {
    const loadMonthStart = async () => {
      const startDay = await loadMonthStartDay();
      setMonthStartDay(startDay);
    };
    loadMonthStart();
  }, []);

  // Alert state
  const [showAmountAlert, setShowAmountAlert] = useState<boolean>(false);

  // Scroll reference
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Keyboard height tracking
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Section position tracking
  const [amountSectionY, setAmountSectionY] = useState(0);
  const [memoSectionY, setMemoSectionY] = useState(0);
  
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    
    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const handleDatePress = () => {
    // 키패드가 열려있으면 닫기
    Keyboard.dismiss();
    
    setTempSelectedDate(date.replace(/\./g, '-'));
    setShowDatePicker(true);
  };

  const handleDatePickerClose = () => {
    setShowDatePicker(false);
  };
  
  const handleDateConfirm = () => {
    if (tempSelectedDate) {
      const formattedDate = tempSelectedDate.replace(/-/g, '.');
      setDate(formattedDate);
    }
    setShowDatePicker(false);
  };

  // amount auto-scroll removed per request

  const handleMemoFocus = () => {
    // 메모 섹션 위치로 스크롤 (하단 버튼 제외)
    // 기기 화면 높이에 비례하여 스크롤 오프셋 계산
    // 아이폰 13 미니(812pt)에서 216px이 최적 → 약 26.6%
    setTimeout(() => {
      if (memoSectionY > 0) {
        const windowHeight = Dimensions.get('window').height;
        const scrollOffset = windowHeight * 0.266; // 화면 높이의 26.6%
        scrollViewRef.current?.scrollTo({ 
          y: memoSectionY - scrollOffset, 
          animated: true 
        });
      }
    }, 350);
  };

  const handleConfirm = async () => {
    // 필수값 검증
    if (!amount || amount === '0' || amount.trim() === '') {
      setShowAmountAlert(true);
      return;
    }
    
    setLoading(true);
    try {
      // 입금 기록 데이터 준비
      const incomeAmount = parseFloat(amount.replace(/,/g, ''));
      const incomeTimestamp = Date.now();

      const incomeRecord: IncomeRecordType = {
        type: 'income',
        amount: incomeAmount,
        date,
        memo,
        timestamp: incomeTimestamp,
      };

      try {
        await createIncome(incomeRecord);
      } catch (error) {
        console.error('[입금 생성] Supabase 저장 실패:', error);
      }
      
      // AsyncStorage에서 기존 calendarData 가져오기
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 날짜 형식 변환 (2025.10.18 → 2025-10-18)
      const dateKey = date.replace(/\./g, '-');
      
      // 기존 데이터가 있으면 업데이트, 없으면 새로 생성
      if (!calendarData[dateKey]) {
        calendarData[dateKey] = {
          totalExpense: 0,
          totalIncome: 0,
          records: [],
        };
      }
      
      // 총 입금 금액 합산 (홈 화면용)
      calendarData[dateKey].totalIncome = (calendarData[dateKey].totalIncome || 0) + incomeRecord.amount;
      
      // 건별 기록 추가 (타임라인용)
      calendarData[dateKey].records = calendarData[dateKey].records || [];
      calendarData[dateKey].records.push({
        type: 'income',
        amount: incomeRecord.amount,
        category: '💰 입금',
        memo: incomeRecord.memo,
        timestamp: incomeTimestamp, // Supabase와 동일한 timestamp 사용
      });
      
      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
      
      // 🔧 수정: 실제 저장된 날짜가 속한 커스텀 월로 이동
      // 날짜 문자열을 로컬 타임존으로 파싱
      const [yearNum, monthNum, dayNum] = dateKey.split('-').map(Number);
      const savedDate = new Date(yearNum, monthNum - 1, dayNum);
      
      // 월 시작일 로드
      const currentMonthStartDay = await loadMonthStartDay();
      
      // 실제 날짜가 속한 커스텀 월 계산
      const customMonthInfo = getCustomMonthInfo(savedDate, currentMonthStartDay);
      const targetYear = customMonthInfo.year;
      const targetMonth = customMonthInfo.month;
      
      console.log('🏠 [입금 이동] 실제 날짜가 속한 커스텀 월 계산:', {
        savedDate: dateKey,
        monthStartDay: currentMonthStartDay,
        targetYear,
        targetMonth,
        customMonthRange: {
          start: customMonthInfo.startDate.toISOString().split('T')[0],
          end: customMonthInfo.endDate.toISOString().split('T')[0]
        }
      });
      
      const [, , day] = dateKey.split('-').map(Number);

      // Stack 정리: 입금 기록 제거하고 홈으로
      await goHomeWithFocus({
        year: targetYear,
        month: targetMonth,
        targetDate: dateKey,
      });
    } catch (error) {
      console.error('[입금 생성] error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <TopNavigation
        type="sub"
        title="입금 기록"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent, 
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 80 + insets.bottom }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
            {/* 날짜 */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                날짜 <Text style={{ color: '#EF5252' }}>*</Text>
              </Text>
              <Pressable onPress={handleDatePress}>
                <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                  <View style={styles.dateRow}>
                    <Icon name="calendarMonth" variant="line" size={24} color={colors.text} />
                    <Text style={[styles.dateText, { color: colors.text }]}>
                      {(() => {
                        if (!date) return '';
                        const [year, month, day] = date.split('.').map(d => parseInt(d, 10));
                        const dayOfWeek = getDayOfWeekLabel(year, month, day);
                        return `${date}(${dayOfWeek})`;
                      })()}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>

            {/* 금액 */}
            <View 
              style={styles.section}
              onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                setAmountSectionY(layout.y);
              }}
            >
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                금액 <Text style={{ color: '#EF5252' }}>*</Text>
              </Text>
              <Input
                variant="line"
                inputType="number"
                unit="원"
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="numeric"
                placeholder="0"
                textAlign="right"
                
              />
            </View>

            {/* 메모 */}
            <View 
              style={styles.section}
              onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                setMemoSectionY(layout.y);
              }}
            >
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                메모
              </Text>
              <Input
                variant="area"
                inputType="text"
                value={memo}
                onChangeText={(text) => {
                  if (text.length <= 20) {
                    setMemo(text);
                  }
                }}
                placeholder="메모를 입력해 주세요.(최대 20자)"
                maxLength={20}
                onFocus={handleMemoFocus}
              />
            </View>
          </ScrollView>
        </View>

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

      {/* 날짜 선택 바텀시트 */}
      {showDatePicker && (
        <ModalBottomsheet
          visible={showDatePicker}
          title="입금 기록일 선택"
          onClose={handleDatePickerClose}
          closeOnBackdrop={true}
          contentStyle={styles.dateBottomsheetContent}
        >
          <CalendarDaySelect
            selectedDate={tempSelectedDate}
            onDayPress={(dateString) => {
              setTempSelectedDate(dateString);
            }}
            monthStartDay={monthStartDay}
          />
          
          <View style={styles.dateButtonArea}>
            <Pressable
              style={[styles.dateButton, { backgroundColor: colors.primary }]}
              onPress={handleDateConfirm}
            >
              <Text style={[styles.dateButtonText, { color: colors.staticWhite }]}>
                확인
              </Text>
            </Pressable>
          </View>
        </ModalBottomsheet>
      )}

      {/* 금액 미입력 얼럿 */}
      <ModalPopup
        visible={showAmountAlert}
        onConfirm={() => setShowAmountAlert(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          금액을 입력해 주세요.
        </Text>
      </ModalPopup>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: 0,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    gap: 8,
  },
  dateText: {
    ...Typography.body1.l.regular,
  },
  dateBottomsheetContent: {
    padding: 0,
  },
  dateButtonArea: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  dateButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateButtonText: {
    ...Typography.body1.l.medium,
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  alertText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
  },
});

