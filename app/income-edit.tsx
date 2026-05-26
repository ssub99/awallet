/**
 * Income Edit Screen
 * 
 * Screen for editing income/deposit transactions.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CalendarDaySelect } from '@/components/ui/calendar-day-select';
import { CustomKeypad, getKeypadHeight, type CustomKeypadOperator, type ExpressionToken } from '@/components/ui/custom-keypad';
import { CustomKeypadOverlay, getCustomKeypadScrollPaddingBottom } from '@/components/ui/custom-keypad-overlay';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { TypographyLayout } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useAndroidKeypadBackDismiss } from '@/hooks/use-android-keypad-back-dismiss';
import { useRecordFormMemoKeyboard } from '@/hooks/use-record-form-memo-keyboard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { getCustomMonthInfo } from '@/utils/custom-month';
import { loadCategories } from '@/utils/categories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calendarRefreshEvent } from '@/hooks/calendar-events';
import { updateIncome, softDeleteIncome } from '@/utils/incomes';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
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
  useWindowDimensions,
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const KEYPAD_HEIGHT = getKeypadHeight(windowWidth);
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
  const [amountExpression, setAmountExpression] = useState<ExpressionToken[]>([]);
  const [isKeypadVisible, setIsKeypadVisible] = useState(false);
  const [isKeypadMounted, setIsKeypadMounted] = useState(false);
  const keypadTranslateY = useRef(new Animated.Value(KEYPAD_HEIGHT)).current;
  const keypadBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [category, setCategory] = useState<string>(recordData?.category ?? '');
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
  const [showCategoryAlert, setShowCategoryAlert] = useState(false);

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
  const [showNoChangesModal, setShowNoChangesModal] = useState<boolean>(false);

  useEffect(() => {
    if (!showDeleteAlert) {
      return;
    }
    void logEvent('modal', {
      screen_name: '/income-edit',
      target: 'delete-modal',
    });
  }, [showDeleteAlert]);

  useEffect(() => {
    if (!showNoChangesModal) {
      return;
    }
    void logEvent('modal', {
      screen_name: '/income-edit',
      target: 'none',
    });
  }, [showNoChangesModal]);

  // Scroll reference
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Section position tracking
  const [amountSectionY, setAmountSectionY] = useState(0);
  const [memoSectionY, setMemoSectionY] = useState(0);
  const memoSectionYRef = useRef(0);
  const memoSectionHeightRef = useRef(0);

  const {
    memoInputRef,
    keyboardPaddingBottom,
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    blurMemoInput,
    handleMemoFocus: scrollMemoOnFocus,
    handleMemoBlur,
    focusMemoInput,
    onMemoScroll,
    memoPointerHandlers,
  } = useRecordFormMemoKeyboard({
    scrollViewRef,
    memoSectionYRef,
    memoSectionHeightRef,
    windowHeight,
    safeAreaBottom: insets.bottom,
  });

  const isScrollingRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextTouchEndRef = useRef(false);
  const skipNextDismissRef = useRef(false);

  const clearDismissTimeout = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
  }, []);

  const handleKeypadDismiss = useCallback(() => {
    setIsKeypadVisible(false);
    setAmountExpression([]);
  }, []);

  useAndroidKeypadBackDismiss(isKeypadVisible, handleKeypadDismiss, {
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    onDismissMemoInput: blurMemoInput,
  });

  const handleAmountFocus = useCallback(() => {
    void logEvent('ui', {
      screen_name: '/income-edit',
      target: 'amount',
    });
    blurMemoInput();
    skipNextDismissRef.current = true;
    if (!isKeypadVisible) {
      setIsKeypadVisible(true);
    }
    // skipNextDismissRef를 짧은 시간 후에 리셋하여 첫 번째 탭에서 바로 닫히도록 함
    setTimeout(() => {
      skipNextDismissRef.current = false;
    }, 100);
    setTimeout(() => {
      if (amountSectionY > 0) {
        const windowHeight = Dimensions.get('window').height;
        const scrollOffset = windowHeight * 0.4; // 화면 높이의 40%
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, amountSectionY - scrollOffset),
          animated: true,
        });
      }
    }, 0);
  }, [amountSectionY, isKeypadVisible]);

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

  const formatAmountDisplay = useCallback((raw: string) => {
    if (!raw) return '0';
    const numeric = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(numeric)) return raw;
    return numeric.toLocaleString();
  }, []);

  const getOperatorSymbol = useCallback((operator: CustomKeypadOperator) => {
    switch (operator) {
      case 'add':
        return '+';
      case 'sub':
        return '-';
      case 'mul':
        return '×';
      case 'div':
        return '÷';
      default:
        return '';
    }
  }, []);

  const amountExpressionView = useMemo(() => {
    const tokensToRender =
      amountExpression.length > 0
        ? amountExpression
        : [{ type: 'number', value: amount.replace(/,/g, '') || '0' }];

    return (
      <ScrollView
        horizontal
        scrollEnabled={false}
        pointerEvents="none"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.amountExpression}
      >
        {tokensToRender.map((token, index) => {
          if (token.type === 'number') {
            return (
              <Text key={`num-${index}`} style={[styles.amountExpressionText, { color: colors.text }]}>
                {formatAmountDisplay(token.value)}
              </Text>
            );
          }

          const symbol = getOperatorSymbol(token.value as CustomKeypadOperator);
          if (!symbol) return null;

          return (
            <Text
              key={`op-${index}`}
              style={[styles.amountExpressionOperator, { color: colors.textNeutral }]}
              accessibilityLabel="연산자"
            >
              {symbol}
            </Text>
          );
        })}
      </ScrollView>
    );
  }, [amount, amountExpression, colors.text, colors.textNeutral, formatAmountDisplay, getOperatorSymbol]);

  useEffect(() => {
    if (isKeypadVisible) {
      setIsKeypadMounted(true);
      keypadTranslateY.setValue(KEYPAD_HEIGHT);
      keypadBackdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(keypadTranslateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(keypadBackdropOpacity, {
          toValue: 1,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (isKeypadMounted) {
      Animated.parallel([
        Animated.timing(keypadTranslateY, {
          toValue: KEYPAD_HEIGHT,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(keypadBackdropOpacity, {
          toValue: 0,
          duration: 100,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setIsKeypadMounted(false);
        }
      });
    }
  }, [isKeypadMounted, isKeypadVisible, keypadBackdropOpacity, keypadTranslateY]);

  const handleDatePress = () => {
    void logEvent('ui', {
      screen_name: '/income-edit',
      target: 'calendar',
    });
    void logEvent('sheet_view', {
      screen_name: '/income-edit',
      target: 'calendar',
    });
    // 키패드가 열려있으면 닫기
    Keyboard.dismiss();
    
    setTempSelectedDate(date.replace(/\./g, '-'));
    setShowDatePicker(true);
  };

  const handleDatePickerClose = () => {
    void logEvent('btn', {
      screen_name: '/income-edit',
      target: 'calendar-close',
    });
    setShowDatePicker(false);
  };
  
  const handleDateConfirm = () => {
    void logEvent('btn', {
      screen_name: '/income-edit',
      target: 'calendar-confirm',
    });
    if (tempSelectedDate) {
      const formattedDate = tempSelectedDate.replace(/-/g, '.');
      setDate(formattedDate);
    }
    setShowDatePicker(false);
  };

  // amount auto-scroll removed per request
  const handleCategoryPress = () => {
    void logEvent('ui', {
      screen_name: '/income-edit',
      target: 'category',
    });
    Keyboard.dismiss();

    router.push({
      pathname: '/expense-category',
      params: {
        type: 'income',
        selectedCategory: category,
        selectedDate: dateKey ? dateKey.replace(/-/g, '.') : undefined,
        calendarYear: params.calendarYear,
        calendarMonth: params.calendarMonth,
        fromEdit: 'true',
      },
    });
  };

  useFocusEffect(
    useCallback(() => {
      const syncCategory = async () => {
        try {
          const selectedCategoryFromStorage = await AsyncStorage.getItem('selectedCategory');
          if (selectedCategoryFromStorage) {
            setCategory(selectedCategoryFromStorage);
            await AsyncStorage.removeItem('selectedCategory');
            return;
          }

          if (recordData?.category) {
            setCategory(recordData.category);
          }
        } catch {
          if (recordData?.category) {
            setCategory(recordData.category);
          }
        }
      };

      syncCategory();
    }, [recordData?.category])
  );

  const [categoryEmojiMap, setCategoryEmojiMap] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCategories('income')
      .then((cats) => {
        const map: Record<string, string> = {};
        cats.forEach((cat) => {
          map[cat.label] = cat.emoji;
        });
        setCategoryEmojiMap(map);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const getCategoryEmojiSafe = (label: string): string => categoryEmojiMap[label] ?? '';
  const categoryDisplay = category ? `${getCategoryEmojiSafe(category)} ${category}` : '';

  const handleMemoFocus = () => {
    void logEvent('ui', {
      screen_name: '/income-edit',
      target: 'memo',
    });
    clearDismissTimeout();
    skipNextDismissRef.current = true;
    if (isKeypadVisible) {
      handleKeypadDismiss();
    }
    scrollMemoOnFocus();
  };

  const handleUpdate = async () => {
    const originalAmount = Number(recordData?.amount ?? 0);
    const currentAmount = Number.parseFloat((amount || '0').replace(/,/g, ''));
    const originalDate = dateKey ? dateKey.replace(/-/g, '.') : '';
    const originalCategory = recordData?.category ?? '';
    const originalMemo = recordData?.memo ?? '';
    const hasChanges =
      currentAmount !== originalAmount ||
      date !== originalDate ||
      category !== originalCategory ||
      memo !== originalMemo;

    if (!hasChanges) {
      setShowNoChangesModal(true);
      return;
    }

    // 필수값 검증
    if (!category) {
      setShowCategoryAlert(true);
      return;
    }

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
          category,
          memo,
        });
      } catch (error) {
        console.error('[수입 수정] 저장 오류:', error);
      }
      
      // 기존 날짜에서 총 수입 금액 차감 및 잔재 제거
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
      
      // 총 수입 금액 추가
      calendarData[newDateKey].totalIncome = (calendarData[newDateKey].totalIncome || 0) + newAmount;
      
      // 건별 기록 추가
      calendarData[newDateKey].records = calendarData[newDateKey].records || [];
      calendarData[newDateKey].records.push({
        type: 'income',
        amount: newAmount,
        category: category || '수입',
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
      console.error('[수입 수정] error:', error);
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
        console.error('[수입 삭제] 소프트 삭제 오류:', error);
      }
      
      // 기존 날짜에서 총 수입 금액 차감 및 잔재 제거
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
      console.error('[수입 삭제] error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    void logEvent('btn', {
      screen_name: '/income-edit',
      target: 'category-option-prev',
    });
    router.back();
  };

  const handleDeleteButtonPress = () => {
    void logEvent('btn', {
      screen_name: '/income-edit',
      target: 'delete',
    });
    setShowDeleteAlert(true);
  };

  const handleDeleteModalCancel = () => {
    void logEvent('btn', {
      screen_name: '/income-edit',
      target: 'delete-cancel',
    });
    setShowDeleteAlert(false);
  };

  const handleDeleteModalConfirm = () => {
    void logEvent('btn', {
      screen_name: '/income-edit',
      target: 'delete-confirm',
    });
    void handleDelete();
  };

  const handleCtaPress = () => {
    void logEvent('btn', {
      screen_name: '/income-edit',
      target: 'cta',
    });
    void handleUpdate();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      <TopNavigation
        type="sub"
        title="수입 내역 수정"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent, 
            { 
              paddingBottom: isMemoSystemKeyboardOpen
                ? keyboardPaddingBottom
                : isKeypadVisible
                ? getCustomKeypadScrollPaddingBottom(KEYPAD_HEIGHT, insets.bottom)
                : 16
            }
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          onScroll={onMemoScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            isScrollingRef.current = true;
            clearDismissTimeout();
            ignoreNextTouchEndRef.current = true;
          }}
          onScrollEndDrag={() => {
            isScrollingRef.current = false;
            setTimeout(() => {
              ignoreNextTouchEndRef.current = false;
            }, 0);
          }}
          onMomentumScrollEnd={() => {
            isScrollingRef.current = false;
            setTimeout(() => {
              ignoreNextTouchEndRef.current = false;
            }, 0);
          }}
          onTouchEnd={() => {
            if (!isKeypadVisible) return;
            clearDismissTimeout();
            if (ignoreNextTouchEndRef.current) {
              ignoreNextTouchEndRef.current = false;
              return;
            }
            if (isScrollingRef.current) return;
            if (skipNextDismissRef.current) {
              skipNextDismissRef.current = false;
              return;
            }
            if (isMemoFocusedRef.current) {
              handleKeypadDismiss();
              return;
            }
            handleKeypadDismiss();
          }}
        >
          {/* 카테고리 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              카테고리 <Text style={{ color: colors.statusNegative }}>*</Text>
            </Text>
            <Input
              value={categoryDisplay}
              placeholder="카테고리 선택"
              showRightArrow
              buttonMode
              onPress={handleCategoryPress}
            />
          </View>

          {/* 날짜 */}
          <View style={styles.section}>
            <View style={styles.dateHeader}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                날짜 <Text style={{ color: colors.statusNegative }}>*</Text>
              </Text>
              <Pressable onPress={handleDeleteButtonPress}>
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
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setAmountSectionY(layout.y);
            }}
          >
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              금액 <Text style={{ color: colors.statusNegative }}>*</Text>
            </Text>
            <Input
              variant="line"
              inputType="number"
              unit="원"
              value={amount}
              onChangeText={handleAmountChange}
              placeholder="0"
              textAlign="right"
              editable={false}
              caretHidden
              valueRenderer={amountExpressionView}
              onPress={handleAmountFocus}
            />
          </View>

          {/* 메모 */}
          <View 
            style={styles.section}
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setMemoSectionY(layout.y);
              memoSectionYRef.current = layout.y;
              memoSectionHeightRef.current = layout.height;
            }}
          >
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              메모
            </Text>
            <Input
              ref={memoInputRef}
              variant="area"
              inputType="text"
              value={memo}
              onChangeText={handleMemoChange}
              placeholder="메모를 입력해 주세요.(최대 20자)"
              maxLength={20}
              onPressIn={memoPointerHandlers.onPressIn}
              onPressOut={memoPointerHandlers.onPressOut}
              onFocus={handleMemoFocus}
              onBlur={handleMemoBlur}
              onKeyPress={handleMemoKeyPress}
              onSubmitEditing={handleMemoSubmitEditing}
              blurOnSubmit={false}
            />
          </View>
        </ScrollView>

      {isKeypadMounted && (
        <CustomKeypadOverlay>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.customKeypadBackdrop,
              { opacity: keypadBackdropOpacity },
            ]}
          />
          <Animated.View
            style={[
              styles.customKeypadContainer,
              { transform: [{ translateY: keypadTranslateY }] },
            ]}
          >
            <CustomKeypad
              value={amount}
              onValueChange={handleAmountChange}
              onConfirm={(nextValue) => {
                handleAmountChange(nextValue);
                setIsKeypadVisible(false);
                setAmountExpression([]);
              }}
              onExpressionChange={setAmountExpression}
            />
          </Animated.View>
        </CustomKeypadOverlay>
      )}

      <View style={[
        styles.bottomButtonContainer, 
        { 
          backgroundColor: colors.staticWhite,
          paddingBottom: 16 + insets.bottom 
        }
      ]}
      onTouchEnd={() => {
        if (isKeypadVisible) {
          handleKeypadDismiss();
        }
      }}
      >
        <Button onPress={handleCtaPress}>
          저장
        </Button>
      </View>
      </View>

      {/* 날짜 선택 바텀시트 */}
      {showDatePicker && (
        <ModalBottomsheet
          visible={showDatePicker}
          title="수입 기록일 선택"
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

      {/* 카테고리 미선택 얼럿 */}
      <ModalPopup
        visible={showCategoryAlert}
        onConfirm={() => setShowCategoryAlert(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          카테고리를 선택해 주세요.
        </Text>
      </ModalPopup>

      {/* 삭제 확인 얼럿 */}
      <ModalPopup
        visible={showDeleteAlert}
        onConfirm={handleDeleteModalConfirm}
        onCancel={handleDeleteModalCancel}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          수입 내역을 삭제하시겠습니까?
        </Text>
      </ModalPopup>

      <ModalPopup
        visible={showNoChangesModal}
        onConfirm={() => setShowNoChangesModal(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          변경사항이 없습니다.
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
  customKeypadBackdrop: {
    flex: 1,
  },
  customKeypadBlur: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  customKeypadContainer: {
    width: '100%',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 8,
  },
  sectionTitle: TypographyLayout.sectionTitle,
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
  amountExpression: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  amountExpressionText: TypographyLayout.fieldNumber,
  amountExpressionOperator: TypographyLayout.fieldNumber,
});
