/**
 * Income Record Screen
 * 
 * Screen for recording income/deposit transactions.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CustomKeypad, getKeypadHeight, type CustomKeypadOperator, type ExpressionToken } from '@/components/ui/custom-keypad';
import { CustomKeypadOverlay, getCustomKeypadScrollPaddingBottom } from '@/components/ui/custom-keypad-overlay';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { RecordDatePickerSheet } from '@/components/ui/record-date-picker-sheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { TypographyLayout } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { calendarRefreshEvent } from '@/hooks/calendar-events';
import { useAndroidKeypadBackDismiss } from '@/hooks/use-android-keypad-back-dismiss';
import { useRecordFormMemoKeyboard } from '@/hooks/use-record-form-memo-keyboard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { loadCategories } from '@/utils/categories';
import { getCustomMonthInfo } from '@/utils/custom-month';
import { generateRecordId } from '@/utils/id-generator';
import { createIncome, type IncomeRecord as IncomeRecordType } from '@/utils/incomes';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
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
    category?: string;
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
  const [amountExpression, setAmountExpression] = useState<ExpressionToken[]>([]);
  const [isKeypadVisible, setIsKeypadVisible] = useState(false);
  const [isKeypadMounted, setIsKeypadMounted] = useState(false);
  const keypadTranslateY = useRef(new Animated.Value(KEYPAD_HEIGHT)).current;
  const keypadBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [category, setCategory] = useState<string>(params.category || '');
  
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
  const [date, setDate] = useState<string>(getInitialDate());
  const [memo, setMemo] = useState<string>('');
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

  // Alert state
  const [showAmountAlert, setShowAmountAlert] = useState<boolean>(false);
  const [showCategoryAlert, setShowCategoryAlert] = useState<boolean>(false);

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
      screen_name: '/income-record',
      target: 'amount',
    });
    blurMemoInput();
    skipNextDismissRef.current = false;
    if (!isKeypadVisible) {
      setIsKeypadVisible(true);
    }
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


  const handleDatePress = () => {
    void logEvent('ui', {
      screen_name: '/income-record',
      target: 'calendar',
    });
    // 이미 열려있으면 무시
    if (showDatePicker) {
      return;
    }
    // 키패드가 열려있으면 닫기
    handleKeypadDismiss();
    Keyboard.dismiss();
    setTempSelectedDate(date.replace(/\./g, '-'));
    void logEvent('sheet_view', {
      screen_name: '/income-record',
      target: 'calendar',
    });
    setShowDatePicker(true);
  };

  const handleDatePickerClose = () => {
    if (!showDatePicker) {
      return;
    }
    void logEvent('btn', {
      screen_name: '/income-record',
      target: 'calendar-close',
    });
    setShowDatePicker(false);
  };
  
  const handleDatePickerDaySelect = useCallback((isoDate: string) => {
    setTempSelectedDate(isoDate);
  }, []);

  const handleDateConfirm = useCallback((isoDate: string) => {
    void logEvent('btn', {
      screen_name: '/income-record',
      target: 'calendar-confirm',
    });
    setShowDatePicker(false);
    const formattedDate = isoDate.replace(/-/g, '.');
    setTimeout(() => {
      setDate(formattedDate);
    }, 50);
  }, []);

  // amount auto-scroll removed per request

  const handleMemoFocus = () => {
    void logEvent('ui', {
      screen_name: '/income-record',
      target: 'memo',
    });
    clearDismissTimeout();
    skipNextDismissRef.current = true;
    if (isKeypadVisible) {
      handleKeypadDismiss();
    }
    scrollMemoOnFocus();
  };

  const handleCategoryPress = () => {
    void logEvent('ui', {
      screen_name: '/income-record',
      target: 'category',
    });
    handleKeypadDismiss();
    Keyboard.dismiss();

    router.push({
      pathname: '/expense-category',
      params: {
        type: 'income',
        selectedCategory: category,
        selectedDate: params.selectedDate,
        calendarYear: params.calendarYear,
        calendarMonth: params.calendarMonth,
        fromEdit: 'true',
      },
    });
  };

  useFocusEffect(
    useCallback(() => {
      const syncCategory = async () => {
        let nextCategory: string | null = null;
        try {
          const selectedCategoryFromStorage = await AsyncStorage.getItem('selectedCategory');

          if (selectedCategoryFromStorage) {
            setCategory(selectedCategoryFromStorage);
            await AsyncStorage.removeItem('selectedCategory');
            nextCategory = selectedCategoryFromStorage;
          }

          if (!selectedCategoryFromStorage && params.category) {
            setCategory(params.category);
            nextCategory = params.category;
          }
        } catch {
          if (params.category) {
            setCategory(params.category);
            nextCategory = params.category;
          }
        }

      };

      syncCategory();
    }, [params.category])
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

  const handleConfirm = async () => {
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
      // 수입 기록 데이터 준비
      const incomeAmount = parseFloat(amount.replace(/,/g, ''));
      const incomeTimestamp = Date.now();

      const incomeRecord: IncomeRecordType = {
        id: generateRecordId(), // UUID 생성
        type: 'income',
        amount: incomeAmount,
        date,
        category,
        memo,
        timestamp: incomeTimestamp,
        createdVia: 'screen',
      };

      try {
        await createIncome(incomeRecord, { simpleCreation: false });
      } catch (error) {
        console.error('[수입 생성] 저장 실패:', error);
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
      
      // 총 수입 금액 합산 (홈 화면용)
      calendarData[dateKey].totalIncome = (calendarData[dateKey].totalIncome || 0) + incomeRecord.amount;
      
      // 건별 기록 추가 (타임라인용)
      calendarData[dateKey].records = calendarData[dateKey].records || [];
      calendarData[dateKey].records.push({
        type: 'income',
        amount: incomeRecord.amount,
        category: category || '수입',
        memo: incomeRecord.memo,
        timestamp: incomeTimestamp, // 기존 기록과 동일한 timestamp 사용
      });
      
      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      // 위젯에 이번달 소비/수입 즉시 반영 (동기화 완료 후 화면 전환)
      await refreshWidgetWithCurrentMonth().catch(() => {});
      
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
      
      // Stack 정리: 수입 기록 제거하고 홈으로
      await goHomeWithFocus({
        year: targetYear,
        month: targetMonth,
        targetDate: dateKey,
      });
    } catch (error) {
      console.error('[수입 생성] error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    void logEvent('btn', {
      screen_name: '/income-record',
      target: 'category-option-prev',
    });
    router.back();
  };

  const handleCtaPress = () => {
    void logEvent('btn', {
      screen_name: '/income-record',
      target: 'cta',
    });
    void handleConfirm();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      <TopNavigation
        type="sub"
        title="수입 기록"
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
            dismissTimeoutRef.current = setTimeout(() => {
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
            }, 0);
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
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                날짜 <Text style={{ color: colors.statusNegative }}>*</Text>
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

        <View
          style={[
            styles.bottomButtonContainer,
            {
              backgroundColor: colors.staticWhite,
              paddingBottom: 16 + insets.bottom,
            },
          ]}
          onTouchEnd={() => {
            if (isKeypadVisible) {
              handleKeypadDismiss();
            }
          }}
        >
          <Button onPress={handleCtaPress}>
            확인
          </Button>
        </View>
      </View>

      {showDatePicker ? (
        <RecordDatePickerSheet
          visible
          title="수입 기록일 선택"
          selectedDate={tempSelectedDate}
          onSelectedDateChange={handleDatePickerDaySelect}
          onClose={handleDatePickerClose}
          onConfirm={handleDateConfirm}
          monthStartDay={monthStartDay}
        />
      ) : null}

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

