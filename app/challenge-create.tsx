/**
 * Challenge Create Screen
 * 
 * Screen for creating a new challenge.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CustomKeypad, getKeypadHeight, type CustomKeypadOperator, type ExpressionToken } from '@/components/ui/custom-keypad';
import { CustomKeypadOverlay, getCustomKeypadScrollPaddingBottom } from '@/components/ui/custom-keypad-overlay';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Switch } from '@/components/ui/switch';
import { AtomicColors } from '@/constants/atomic-colors';
import { type Category } from '@/constants/categories';
import {
    buildChallengeRecurringMonthPickerOptions,
    CHALLENGE_RECURRING_MONTH_MIN,
} from '@/constants/challenge-recurring-months';
import { Colors, Typography } from '@/constants/theme';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { loadCategories } from '@/utils/categories';
import { createChallenges, type ChallengeRecord } from '@/utils/challenges';
import { generateGroupId, generateRecordId } from '@/utils/id-generator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeypadGlassShell } from '@/components/ui/keypad-glass-shell';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Keyboard, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableWithoutFeedback, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChallengeCreateScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const KEYPAD_HEIGHT = getKeypadHeight(windowWidth);
  const { setLoading } = useLoading();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ 
    category?: string;
    selectedDate?: string;
    calendarYear?: string;
    calendarMonth?: string;
  }>();

  // 챌린지는 "월 버킷" 기준으로만 시작 위치를 잡으면 되므로
  // 캘린더 컨텍스트의 calendarYear/calendarMonth만 사용
  const [startYear, setStartYear] = useState<number>(() => {
    if (params.calendarYear) {
      return parseInt(params.calendarYear, 10);
    }
    return new Date().getFullYear();
  });
  
  const [startMonth, setStartMonth] = useState<number>(() => {
    if (params.calendarMonth) {
      return parseInt(params.calendarMonth, 10);
    }
    return new Date().getMonth() + 1;
  });

  // 일자는 현재 선택된 날짜가 있다면 그 day, 없으면 오늘 day 정도만 참고 (챌린지는 월 기준)
  const selectedDay = params.selectedDate 
    ? new Date(params.selectedDate).getDate()
    : new Date().getDate();

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
  const [showTargetAmountAlert, setShowTargetAmountAlert] = useState(false);
  const [amountExpression, setAmountExpression] = useState<ExpressionToken[]>([]);
  const [isKeypadVisible, setIsKeypadVisible] = useState(false);
  const [isKeypadMounted, setIsKeypadMounted] = useState(false);
  const keypadTranslateY = useRef(new Animated.Value(KEYPAD_HEIGHT)).current;
  const keypadBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringMonths, setRecurringMonths] = useState<number>(CHALLENGE_RECURRING_MONTH_MIN);
  const recurringMonthPickerOptions = useMemo(
    () => buildChallengeRecurringMonthPickerOptions(),
    [],
  );
  const [showYearMonthPicker, setShowYearMonthPicker] = useState<boolean>(false);
  const [showRecurringMonthsPicker, setShowRecurringMonthsPicker] = useState<boolean>(false);
  const [monthStartDay, setMonthStartDay] = useState<number>(1);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [amountSectionY, setAmountSectionY] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const isScrollingRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextTouchEndRef = useRef(false);

  useEffect(() => {
    if (!toastVisible) {
      return;
    }
    showToast(toastMessage);
    setToastVisible(false);
  }, [showToast, toastMessage, toastVisible]);
  
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
    
    if (!numbersOnly) {
      setTargetAmount('');
      return;
    }

    // 숫자로 변환
    const num = parseInt(numbersOnly, 10);

    // 최대값 제한: 소비 기록과 동일하게 10억 (1,000,000,000)
    const MAX_AMOUNT = 1000000000;
    const clamped = Math.min(num, MAX_AMOUNT);

    // 포맷팅된 값으로 설정
    setTargetAmount(clamped.toLocaleString());
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
        : [{ type: 'number', value: targetAmount.replace(/,/g, '') || '0' }];

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
  }, [amountExpression, colors.text, colors.textNeutral, formatAmountDisplay, getOperatorSymbol, targetAmount]);

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

  const handleAmountFocus = useCallback(() => {
    void logEvent('ui', {
      screen_name: '/challenge-create',
      target: 'amount',
    });
    Keyboard.dismiss();
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


  // 카테고리명에 이모지 추가하는 함수
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);

  useEffect(() => {
    loadCategories('expense')
      .then(setExpenseCategories)
      .catch(() => {
        // 로드 실패 시 빈 배열 유지 (UI에서 기본 문자열만 표시)
      });
  }, []);

  const getCategoryWithEmoji = (categoryName: string) => {
    const category = expenseCategories.find(cat => cat.label === categoryName);
    return category ? `${category.emoji} ${categoryName}` : categoryName;
  };

  const handleConfirm = async () => {
    // 필수값 검증
    if (!category) {
      setToastMessage('카테고리를 선택해 주세요.');
      setToastVisible(true);
      return;
    }
    
    if (!targetAmount || targetAmount === '0' || targetAmount.trim() === '') {
      setShowTargetAmountAlert(true);
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
          anchorStartDate: challengeStartDate, // 원본 앵커 유지
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
      
      // 중복이 없으면 recurringId 생성하고 챌린지 생성
      const recurringId = generateGroupId('recurring');
      newChallenges.forEach((challenge) => {
        challenge.recurringId = recurringId;
      });
      
      await createChallenges(newChallenges);

      // ✅ 챌린지 생성 시점에는 알림 스케줄링하지 않음
      // 첫 소비 기록 저장 시 triggerChallengeNotifications()에서 알림이 트리거됨
      
      // 챌린지 현황으로 이동 (첫 번째 챌린지의 시작일이 속하는 년/월로 이동)
      const firstChallenge = newChallenges[0];
      const [targetYear, targetMonth] = firstChallenge.startDate.split('.').map(Number);

      // 키패드·언마운트와 reset 타이밍 분리: 키패드 닫고 짧은 지연 후 reset
      Keyboard.dismiss();
      setTimeout(() => {
        (navigation as any).reset({
          index: 0,
          routes: [
            {
              name: '(tabs)',
              params: {
                screen: 'challenge',
                params: {
                  year: targetYear.toString(),
                  month: targetMonth.toString(),
                },
              },
            },
          ],
        });
      }, 50);
    } catch (error) {
      console.error('[챌린지 생성] error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCtaPress = () => {
    void logEvent('btn', {
      screen_name: '/challenge-create',
      target: 'cta',
    });
    void handleConfirm();
  };

  const handleBack = () => {

    router.back();
  };

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        // 수입/소비 기록과 동일하게, 바깥 터치로는 소프트 키보드만 닫고
        // 커스텀 키패드는 강제로 닫지 않는다.
        Keyboard.dismiss();
      }}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
        <StatusBar barStyle="dark-content" />
      
        <TopNavigation
          type="sub"
          title="챌린지 생성"
          showLeftIcon
          onLeftIconPress={handleBack}
        />

        <ScrollView 
          ref={scrollViewRef}
          style={[styles.content, { backgroundColor: colors.fill }]}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: isKeypadVisible ? getCustomKeypadScrollPaddingBottom(KEYPAD_HEIGHT, insets.bottom) : 24 }
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          overScrollMode="never"
          onTouchEnd={() => {
            // 수입/소비 기록과 동일하게, 본문 영역을 탭하면 커스텀 키패드를 닫는다.
            if (!isKeypadVisible) return;
            clearDismissTimeout();
            handleKeypadDismiss();
          }}
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
        >
          {/* 카테고리 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              카테고리 <Text style={{ color: '#EF5252' }}>*</Text>
            </Text>
            <Pressable onPress={() => {
              void logEvent('ui', {
                screen_name: '/challenge-create',
                target: 'category-option',
              });
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
                  selectedCategory: category,
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
              void logEvent('ui', {
                screen_name: '/challenge-create',
                target: 'calendar',
              });
              void logEvent('sheet_view', {
                screen_name: '/challenge-create',
                target: 'calendar',
              });

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
          <View
            style={styles.section}
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setAmountSectionY(layout.y);
            }}
          >
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              목표 소비 금액 <Text style={{ color: '#EF5252' }}>*</Text>
            </Text>
            <Input
              variant="line"
              inputType="number"
              unit="원"
              value={targetAmount}
              onChangeText={handleAmountChange}
              placeholder="0"
              textAlign="right"
              editable={false}
              caretHidden
              valueRenderer={amountExpressionView}
              onPress={handleAmountFocus}
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
                      void logEvent('ui', {
                        screen_name: '/challenge-create',
                        target: 'recurring-toggle',
                      });

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
                void logEvent('ui', {
                  screen_name: '/challenge-create',
                  target: 'recurring-period',
                });
                void logEvent('sheet_view', {
                  screen_name: '/challenge-create',
                  target: 'recurring',
                });

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
              <KeypadGlassShell style={styles.customKeypadBlur}>
                <CustomKeypad
                  value={targetAmount}
                  onValueChange={handleAmountChange}
                  onConfirm={(nextValue) => {
                    handleAmountChange(nextValue);
                    setIsKeypadVisible(false);
                    setAmountExpression([]);
                  }}
                  onExpressionChange={setAmountExpression}
                />
              </KeypadGlassShell>
            </Animated.View>
          </CustomKeypadOverlay>
        )}

        {/* 하단 고정 버튼 */}
        <View style={[
          styles.bottomButtonContainer, 
          { 
            backgroundColor: colors.staticWhite,
            paddingBottom: 16 + insets.bottom 
          }
        ]}>
          <Button onPress={handleCtaPress}>
            확인
          </Button>
        </View>

        <ModalPopup
          visible={showTargetAmountAlert}
          onConfirm={() => setShowTargetAmountAlert(false)}
          confirmText="확인"
        >
          <Text style={[styles.modalText, { color: colors.text }]}>
            목표 소비 금액을 입력해 주세요.
          </Text>
        </ModalPopup>

        {/* 시작 년월 선택 피커 */}
        <DatePicker
          visible={showYearMonthPicker}
          onClose={() => setShowYearMonthPicker(false)}
          onCancelPress={() => {
            void logEvent('btn', {
              screen_name: '/challenge-create',
              target: 'challenge-create-close',
            });
          }}
          onDonePress={() => {
            void logEvent('btn', {
              screen_name: '/challenge-create',
              target: 'challenge-create-confirm',
            });
          }}
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
          onCancelPress={() => {
            void logEvent('btn', {
              screen_name: '/challenge-create',
              target: 'recurring-close',
            });
          }}
          onDonePress={() => {
            void logEvent('btn', {
              screen_name: '/challenge-create',
              target: 'recurring-confirm',
            });
          }}
          title="반복할 개월 수"
          dayOptions={recurringMonthPickerOptions}
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
  modalText: {
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
  amountExpressionText: {
    ...Typography.body1.l.bold,
  },
  amountExpressionOperator: {
    ...Typography.body1.l.bold,
  },
});
