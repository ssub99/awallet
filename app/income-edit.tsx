/**
 * Income Edit Screen
 * 
 * Screen for editing income/deposit transactions.
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
import { updateIncome, softDeleteIncome } from '@/utils/incomes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  InteractionManager,
  Keyboard,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

/**
 * 요일 계산 함수
 */
function getDayOfWeekLabel(year: number, month: number, day: number): string {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(year, month - 1, day);
  return weekdays[date.getDay()];
}

interface IncomeRecordData {
  type: 'income';
  amount: number;
  category: string;
  memo?: string;
  timestamp: number;
}

export default function IncomeEditScreen() {
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
        console.warn('[income-edit] Failed to store pending target:', error);
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
    recordData?: string;
    dateKey?: string;
    recordIndex?: string;
    calendarYear?: string;
    calendarMonth?: string;
  }>();

  // Parse record data from params
  const recordData: IncomeRecordData | null = params.recordData ? JSON.parse(params.recordData) : null;
  const dateKey = params.dateKey || '';
  const recordIndex = params.recordIndex ? parseInt(params.recordIndex) : 0;

  // Form state - Initialize with existing data
  const [amount, setAmount] = useState<string>(recordData ? recordData.amount.toLocaleString() : '');
  const [date, setDate] = useState<string>(() => {
    if (dateKey) {
      // "2025-01-15" 형식을 "2025.01.15" 형식으로 변환
      return dateKey.replace(/-/g, '.');
    }
    return '';
  });
  const [memo, setMemo] = useState<string>(recordData?.memo || '');
  const handleMemoChange = useCallback((text: string) => {
    const trimmed = text.replace(/[\r\n]/g, '');
    if (trimmed.length <= 20) {
      setMemo(trimmed);
    }
  }, []);

  const handleMemoKeyPress = useCallback((event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (event.nativeEvent.key === 'Enter') {
      Keyboard.dismiss();
    }
  }, []);

  const handleMemoSubmitEditing = useCallback(() => {
    Keyboard.dismiss();
  }, []);
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

  // Alert states
  const [showAmountAlert, setShowAmountAlert] = useState<boolean>(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState<boolean>(false);

  // Scroll reference
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Keyboard height tracking
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Section position tracking
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

  // 금액 입력 시 처리하는 함수 (Input 컴포넌트에서 이미 포맷팅됨)
  const handleAmountChange = (text: string) => {
    // 콤마 제거 후 숫자만 추출
    const numbersOnly = text.replace(/,/g, '');
    
    // 빈 문자열이면 그대로 설정
    if (!numbersOnly) {
      setAmount('');
      return;
    }
    
    // 숫자로 변환
    const num = parseInt(numbersOnly, 10);
    
    // 최대값 제한: 10억 (1,000,000,000)
    const MAX_AMOUNT = 1000000000;
    if (num > MAX_AMOUNT) {
      // 최대값으로 제한
      setAmount(MAX_AMOUNT.toLocaleString());
      return;
    }
    
    // 포맷팅된 값으로 설정
    setAmount(num.toLocaleString());
  };

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

  const handleUpdate = async () => {
    // 필수값 검증
    if (!amount || amount === '0' || amount.trim() === '') {
      setShowAmountAlert(true);
      return;
    }
    
    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 날짜 형식 변환 (2025.10.18 → 2025-10-18)
      const newDateKey = date.replace(/\./g, '-');
      const oldDateKey = dateKey;
      
      // 기존 기록의 금액
      const oldAmount = recordData?.amount || 0;
      const newAmount = parseFloat(amount.replace(/,/g, ''));
      const recordTimestamp = recordData?.timestamp ?? Date.now();
      const incomeId = recordTimestamp.toString();

      try {
        await updateIncome(incomeId, {
          amount: newAmount,
          date,
          memo,
        });
      } catch (error) {
        console.error('[입금 수정] 저장 오류:', error);
      }
      
      // 기존 날짜에서 총 입금 금액 차감 및 잔재 제거
      if (calendarData[oldDateKey]) {
        calendarData[oldDateKey].totalIncome = Math.max(0, (calendarData[oldDateKey].totalIncome || 0) - oldAmount);
        
        // 기존 기록 제거
        if (calendarData[oldDateKey].records && calendarData[oldDateKey].records[recordIndex]) {
          calendarData[oldDateKey].records.splice(recordIndex, 1);
        }
        
        // 잔재 제거: 기록 없고 총액 0이면 키 삭제
        const bucket = calendarData[oldDateKey];
        const hasNoRecords = !bucket.records || bucket.records.length === 0;
        const noTotals = (bucket.totalIncome || 0) === 0 && (bucket.totalExpense || 0) === 0;
        if (hasNoRecords && noTotals) {
          delete calendarData[oldDateKey];
        }
      }
      
      // 새 날짜에 데이터 추가
      if (!calendarData[newDateKey]) {
        calendarData[newDateKey] = {
          totalExpense: 0,
          totalIncome: 0,
          records: [],
        };
      }
      
      // 총 입금 금액 추가
      calendarData[newDateKey].totalIncome = (calendarData[newDateKey].totalIncome || 0) + newAmount;
      
      // 건별 기록 추가
      calendarData[newDateKey].records = calendarData[newDateKey].records || [];
      calendarData[newDateKey].records.push({
        type: 'income',
        amount: newAmount,
        category: '💰 입금',
        memo: memo,
        timestamp: recordTimestamp,
      });
      
      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
      
      // 🔧 수정: 실제 저장된 날짜가 속한 커스텀 월로 이동
      // 날짜 문자열을 로컬 타임존으로 파싱
      const [yearNum, monthNum, dayNum] = newDateKey.split('-').map(Number);
      const savedDate = new Date(yearNum, monthNum - 1, dayNum);
      
      // 월 시작일 로드
      const currentMonthStartDay = await loadMonthStartDay();
      
      // 실제 날짜가 속한 커스텀 월 계산
      const customMonthInfo = getCustomMonthInfo(savedDate, currentMonthStartDay);
      const targetYear = customMonthInfo.year;
      const targetMonth = customMonthInfo.month;
      
      // Stack 정리: 수정 화면 제거하고 홈으로
      await goHomeWithFocus({
        year: targetYear,
        month: targetMonth,
        targetDate: newDateKey,
      });
    } catch (error) {
      console.error('[입금 수정] error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 기존 기록의 금액
      const oldAmount = recordData?.amount || 0;
      const recordTimestamp = recordData?.timestamp ?? Date.now();
      const incomeId = recordTimestamp.toString();

      try {
        await softDeleteIncome(incomeId);
      } catch (error) {
        console.error('[입금 삭제] 소프트 삭제 오류:', error);
      }
      
      // 기존 날짜에서 총 입금 금액 차감 및 잔재 제거
      if (calendarData[dateKey]) {
        calendarData[dateKey].totalIncome = Math.max(0, (calendarData[dateKey].totalIncome || 0) - oldAmount);
        
        // 기존 기록 제거
        if (calendarData[dateKey].records && calendarData[dateKey].records[recordIndex]) {
          calendarData[dateKey].records.splice(recordIndex, 1);
        }
        
        // 잔재 제거: 기록 없고 총액 0이면 키 삭제
        const bucket = calendarData[dateKey];
        const hasNoRecords = !bucket.records || bucket.records.length === 0;
        const noTotals = (bucket.totalIncome || 0) === 0 && (bucket.totalExpense || 0) === 0;
        if (hasNoRecords && noTotals) {
          delete calendarData[dateKey];
        }
      }
      
      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
      
      // 타임라인에서 왔으면 타임라인으로, 아니면 홈으로 이동
      if (params.calendarYear && params.calendarMonth) {
        // 타임라인으로 복귀

        await goHomeWithFocus({
          year: Number(params.calendarYear),
          month: Number(params.calendarMonth),
          targetDate: dateKey,
        });
      } else {
        // 홈으로 이동
        const today = new Date();
        const currentMonthStartDay = await loadMonthStartDay();
        const customMonthInfo = getCustomMonthInfo(today, currentMonthStartDay);
        const targetYear = customMonthInfo.year;
        const targetMonth = customMonthInfo.month;

        await goHomeWithFocus({
          year: targetYear,
          month: targetMonth,
          targetDate: dateKey,
        });
      }
    } catch (error) {
      console.error('[입금 삭제] error:', error);
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
        title="입금 내역 수정"
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
            <View style={styles.dateHeader}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                날짜 <Text style={{ color: '#EF5252' }}>*</Text>
              </Text>
              <Pressable onPress={() => setShowDeleteAlert(true)}>
                <Text style={[styles.deleteButton, { color: colors.statusNegative }]}> 
                  삭제
                </Text>
              </Pressable>
            </View>
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
              onChangeText={handleMemoChange}
              placeholder="메모를 입력해 주세요.(최대 20자)"
              maxLength={20}
              onFocus={handleMemoFocus}
              onKeyPress={handleMemoKeyPress}
              onSubmitEditing={handleMemoSubmitEditing}
              blurOnSubmit={false}
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
        <Button onPress={handleUpdate}>
          저장
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

      {/* 삭제 확인 얼럿 */}
      <ModalPopup
        visible={showDeleteAlert}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteAlert(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          입금 내역을 삭제하시겠습니까?
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
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteButton: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
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
