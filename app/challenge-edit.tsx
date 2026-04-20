/**
 * Challenge Edit Screen
 * 
 * Screen for editing an existing challenge.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CustomKeypad, getKeypadHeight, type CustomKeypadOperator, type ExpressionToken } from '@/components/ui/custom-keypad';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Switch } from '@/components/ui/switch';
import { AtomicColors } from '@/constants/atomic-colors';
import { type Category } from '@/constants/categories';
import { Colors, Typography } from '@/constants/theme';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { loadCategories } from '@/utils/categories';
import { cancelChallengeFailureNotification, cancelChallengeProgressNotifications, cancelChallengeSuccessNotification } from '@/utils/notification-scheduler';
import { getChallengeById, getChallengesByRecurringId, softDeleteChallengesByRecurringId, updateChallengesByRecurringId, type ChallengeRecord } from '@/utils/challenges';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Keyboard, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChallengeEditScreen() {
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
    challengeId?: string;
  }>();

  // Form state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [amountExpression, setAmountExpression] = useState<ExpressionToken[]>([]);
  const [isKeypadVisible, setIsKeypadVisible] = useState(false);
  const [isKeypadMounted, setIsKeypadMounted] = useState(false);
  const keypadTranslateY = useRef(new Animated.Value(KEYPAD_HEIGHT)).current;
  const keypadBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [category, setCategory] = useState<string>('');
  const [currentAmount, setCurrentAmount] = useState<number>(0);
  const [recurringId, setRecurringId] = useState<string>('');
  const [isRecurringChallenge, setIsRecurringChallenge] = useState<boolean>(false);
  const [recurringCount, setRecurringCount] = useState<number>(1);
  const [monthStartDay, setMonthStartDay] = useState<number>(1);
  const [amountSectionY, setAmountSectionY] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const isScrollingRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextTouchEndRef = useRef(false);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  
  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  
  // 토스트 표시 함수
  const showDisabledToast = () => {
    showToast('변경할 수 없습니다. 새로 생성해 주세요.');
  };

  const logChallengeEditEvent = useCallback(
    (eventType: 'btn' | 'ui' | 'modal', target: string) => {
      logEvent(eventType, {
        screen_name: '/challenge-edit',
        target,
      });
    },
    []
  );

  const handleCalendarPress = useCallback(() => {
    logChallengeEditEvent('ui', 'calendar');
    showDisabledToast();
  }, [logChallengeEditEvent]);

  const handleRecurringTogglePress = useCallback(() => {
    logChallengeEditEvent('ui', 'recurring-toggle');
    showDisabledToast();
  }, [logChallengeEditEvent]);

  // Load challenge data
  useEffect(() => {
    const loadChallengeData = async () => {
      setLoading(true);
      setIsContentReady(false);
      if (!params.challengeId) {
        setIsContentReady(true);
        setLoading(false);
        return;
      }
      
      // 월 시작일 로드
      const monthStart = await loadMonthStartDay();
      setMonthStartDay(monthStart);
      
      try {
        const challenge = await getChallengeById(params.challengeId);
        if (!challenge || challenge.isDeleted) {
          setIsContentReady(true);
          return;
        }

        setRecurringId(challenge.recurringId);
            setStartDate(challenge.startDate);
            setEndDate(challenge.endDate);
        setTargetAmount(
          typeof challenge.targetAmount === 'number'
            ? challenge.targetAmount.toLocaleString()
            : ''
        );
            setCategory(challenge.category);

        const relatedChallenges = await getChallengesByRecurringId(challenge.recurringId);
        const recurringChallenges = relatedChallenges.length > 0 ? relatedChallenges : [challenge];
        const isRecurring = recurringChallenges.length > 1;

            setIsRecurringChallenge(isRecurring);
        setRecurringCount(recurringChallenges.length);

        const currentAmountValue = await calculateCurrentAmount(challenge);
        setCurrentAmount(currentAmountValue);
      } catch (error) {
        console.error('[챌린지 수정] 데이터 로드 실패:', error);
      } finally {
        setIsContentReady(true);
        setLoading(false);
      }
    };

    loadChallengeData();
  }, [params.challengeId, setLoading]);

  useEffect(() => {
    if (isContentReady) {
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [isContentReady, contentOpacity]);

  // 현재 소비금액 계산
  const calculateCurrentAmount = async (challenge: ChallengeRecord): Promise<number> => {
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      if (!storedData) return 0;

      const calendarData = JSON.parse(storedData);
      let totalAmount = 0;

      // 챌린지 시작일과 종료일을 Date 객체로 변환
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
    } catch {

      return 0;
    }
  };

  // 금액 입력 시 처리하는 함수 (소비 기록과 동일한 상한선 적용)
  const handleAmountChange = (text: string) => {
    const numbersOnly = text.replace(/[^0-9]/g, '');
    
    if (!numbersOnly) {
      setTargetAmount('');
      return;
    }

    const num = parseInt(numbersOnly, 10);
    const MAX_AMOUNT = 1000000000; // 10억
    const clamped = Math.min(num, MAX_AMOUNT);

    setTargetAmount(clamped.toLocaleString());
  };

  const formatAmountDisplay = useCallback((raw: string) => {
    if (!raw) return '0';
    const numeric = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(numeric)) return raw;
    return numeric.toLocaleString();
  }, []);

  const getRgbaColor = useCallback((hex: string, opacity: number) => {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }, []);

  const keypadTintColor = useMemo(
    () => getRgbaColor(AtomicColors.neutral[300], 0.8),
    [getRgbaColor]
  );

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
    logChallengeEditEvent('ui', 'amount');
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
  }, [amountSectionY, isKeypadVisible, logChallengeEditEvent]);

  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);

  useEffect(() => {
    loadCategories('expense')
      .then(setExpenseCategories)
      .catch(() => {
        // 로드 실패 시 빈 배열 유지
      });
  }, []);

  // 카테고리명에 이모지 추가하는 함수
  const getCategoryWithEmoji = (categoryName: string) => {
    const category = expenseCategories.find(cat => cat.label === categoryName);
    return category ? `${category.emoji} ${categoryName}` : categoryName;
  };

  const handleSave = async () => {
    logChallengeEditEvent('btn', 'cta');
    // 필수값 검증
    if (!targetAmount || targetAmount === '0' || targetAmount.trim() === '') {
      Alert.alert('알림', '목표 소비 금액을 입력해주세요.');
      return;
    }
    
    setLoading(true);
    try {
      const targetAmountNum = parseFloat(targetAmount.replace(/,/g, ''));

      if (!recurringId) {
        throw new Error('챌린지 그룹 식별자가 없습니다.');
      }

      await updateChallengesByRecurringId(recurringId, {
            targetAmount: targetAmountNum,
        updatedAt: Date.now(),
      });

      // 키패드·언마운트와 reset 타이밍 분리: 키패드 닫고 짧은 지연 후 reset
      Keyboard.dismiss();
      const now = new Date();
      setTimeout(() => {
        (navigation as any).reset({
          index: 0,
          routes: [
            {
              name: '(tabs)',
              params: {
                screen: 'challenge',
                params: {
                  year: now.getFullYear().toString(),
                  month: (now.getMonth() + 1).toString(),
                },
              },
            },
          ],
        });
      }, 50);
    } catch (error) {
      console.error('[챌린지 수정] error:', error);
      Alert.alert('오류', '챌린지 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    logChallengeEditEvent('btn', 'delete');
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    logChallengeEditEvent('btn', 'delete-confirm');
    setLoading(true);
    try {
      if (!recurringId) {
        throw new Error('삭제할 챌린지를 찾을 수 없습니다.');
      }

      // 삭제 전에 해당 recurringId로 삭제될 챌린지 ID 목록 확보 (푸시 취소용)
      const challengesToDelete = await getChallengesByRecurringId(recurringId);
      const challengeIds = challengesToDelete.map((c) => c.id);

      await softDeleteChallengesByRecurringId(recurringId);

      // 해당 챌린지들에 스케줄된 푸시(진행현황·성공·실패) 전부 취소
      for (const challengeId of challengeIds) {
        await cancelChallengeProgressNotifications(challengeId);
        await cancelChallengeSuccessNotification(challengeId);
        await cancelChallengeFailureNotification(challengeId);
      }

      setShowDeleteModal(false);

      // 키패드·언마운트와 reset 타이밍 분리: 키패드 닫고 짧은 지연 후 reset
      Keyboard.dismiss();
      const now = new Date();
      setTimeout(() => {
        (navigation as any).reset({
          index: 0,
          routes: [
            {
              name: '(tabs)',
              params: {
                screen: 'challenge',
                params: {
                  year: now.getFullYear().toString(),
                  month: (now.getMonth() + 1).toString(),
                },
              },
            },
          ],
        });
      }, 50);
    } catch (error) {
      console.error('[챌린지 삭제] error:', error);
      Alert.alert('오류', '챌린지 삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {

    router.back();
  };

  useEffect(() => {
    if (showDeleteModal) {
      logChallengeEditEvent('modal', 'modal');
    }
  }, [logChallengeEditEvent, showDeleteModal]);

  // 진행 전 챌린지 여부 확인 (월 시작일 고려)
  const isBeforeStart = () => {
    if (!startDate) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDateObj = new Date(startDate.replace(/\./g, '-'));
    startDateObj.setHours(0, 0, 0, 0);
    
    console.log('🔍 [챌린지 수정] 진행 전 여부 확인:', {
      startDate: startDate,
      today: today.toISOString().split('T')[0],
      monthStartDay: monthStartDay
    });
    
    // 챌린지 시작일 판단 (단순히 현재 날짜와 비교)
    console.log('🔍 [챌린지 수정] 시작일 비교:', {
      startDate: startDateObj.toISOString().split('T')[0],
      today: today.toISOString().split('T')[0],
      isBeforeStart: startDateObj > today
    });
    
    return startDateObj > today;
  };

  // D-day 계산
  const getDDay = () => {

    if (!startDate || !endDate) {

      return '';
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 시간 제거
    
    const startDateObj = new Date(startDate.replace(/\./g, '-'));
    startDateObj.setHours(0, 0, 0, 0);
    
    const endDateObj = new Date(endDate.replace(/\./g, '-'));
    endDateObj.setHours(0, 0, 0, 0);
    
    console.log('📆 [D-day 계산] 오늘:', today.toISOString().split('T')[0]);
    console.log('📆 [D-day 계산] 시작일 객체:', startDateObj.toISOString().split('T')[0]);
    console.log('📆 [D-day 계산] 종료일 객체:', endDateObj.toISOString().split('T')[0]);
    
    // 챌린지 시작일 판단 (단순히 현재 날짜와 비교)
    console.log('📆 [D-day 계산] 시작일 비교:', {
      startDate: startDateObj.toISOString().split('T')[0],
      today: today.toISOString().split('T')[0],
      isStarted: startDateObj <= today
    });
    
    // 시작일이 미래인 경우: "진행 전"
    if (startDateObj > today) {

      return '진행 전';
    }
    
    // 챌린지가 진행 중인 경우: 남은 기간 표시
    const baseTime = today.getTime();
    const endDateTime = endDateObj.getTime();
    const diffTime = endDateTime - baseTime;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    console.log('📆 [D-day 계산] 계산 상세:', {
      baseDate: today.toISOString().split('T')[0],
      baseTime,
      endDateTime,
      diffTime,
      diffDays: diffTime / (1000 * 60 * 60 * 24),
      daysLeft,
      result: daysLeft < 0 ? '종료' : daysLeft === 0 ? 'D-0' : `D-${daysLeft}`
    });
    
    if (daysLeft < 0) {
      return '종료';
    } else if (daysLeft === 0) {
      return 'D-0';
    } else {
      return `D-${daysLeft}`;
    }
  };

  // 챌린지 상태 계산
  const getChallengeStatus = () => {
    if (!endDate || !targetAmount) return null;
    
    const today = new Date();
    const endDateObj = new Date(endDate.replace(/\./g, '-'));
    const daysLeft = Math.ceil((endDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const targetAmountNum = Number(targetAmount.replace(/,/g, ''));
    const isOverBudget = currentAmount > targetAmountNum;
    
    if (daysLeft < 0) {
      return {
        text: isOverBudget ? 'Failed' : 'Success',
        color: isOverBudget ? '#ef5252' : '#07b63b',
        bgColor: isOverBudget ? '#ef5252' : '#07b63b'
      };
    }
    
    return null;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
        <TopNavigation
          type="sub"
          title="챌린지 수정"
          showLeftIcon
          onLeftIconPress={handleBack}
        />

        <Animated.View style={{ flex: 1, opacity: isContentReady ? contentOpacity : 0 }}>
          <ScrollView 
            ref={scrollViewRef}
            style={[styles.content, { backgroundColor: colors.fill }]}
            contentContainerStyle={[
              styles.contentContainer,
              { paddingBottom: isKeypadVisible ? KEYPAD_HEIGHT + 16 - insets.bottom : 24 }
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            bounces={false}
            overScrollMode="never"
            onTouchEnd={() => {
              // 수입/소비 기록과 동일하게, 본문 영역을 탭하면 커스텀 키패드를 닫는다.
              if (!isKeypadVisible) return;
              clearDismissTimeout();
              handleKeypadDismiss();
            }}
          >
          {/* 챌린지 정보 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                챌린지 정보
              </Text>
              <Pressable onPress={handleDelete}>
                <Text style={[styles.deleteText, { color: colors.statusNegative }]}> 
                  삭제
                </Text>
              </Pressable>
            </View>
            
            <View style={[styles.challengeInfoCard, { backgroundColor: colors.staticWhite }]}>
              {/* 카테고리와 D-day */}
              <View style={styles.challengeHeader}>
                <Text style={[styles.categoryText, { color: colors.staticBlack }]}>
                  {getCategoryWithEmoji(category)}
                </Text>
                <View style={styles.statusContainer}>
                  {getChallengeStatus() && (
                    <View style={[styles.statusBadge, { backgroundColor: getChallengeStatus()?.bgColor }]}>
                      <Text style={[styles.statusText, { color: '#ffffff' }]}>
                        {getChallengeStatus()?.text}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.ddayText, { color: colors.staticBlack }]}>
                    {getDDay()}
                  </Text>
                </View>
              </View>
              
              {/* 구분선 */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              
              {/* 금액 정보 */}
              <View style={styles.amountInfo}>
                <View style={styles.amountRow}>
                  <Text style={[styles.amountLabel, { color: colors.textAssistive }]}>
                    현재 소비금액
                  </Text>
                  <Text style={[styles.amountValue, { color: colors.text }]}>
                    {isBeforeStart() ? '0원' : `${currentAmount.toLocaleString()}원`}
                  </Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={[styles.amountLabel, { color: colors.textAssistive }]}>
                    목표 소비금액
                  </Text>
                  <Text style={[styles.amountValue, { color: colors.text }]}>
                    {targetAmount ? `${Number(targetAmount.replace(/,/g, '')).toLocaleString()}원` : '0원'}
                  </Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={[styles.amountLabel, { color: colors.textAssistive }]}>
                    챌린지 기간
                  </Text>
                  <Text style={[styles.amountValue, { color: colors.text }]}>
                    {(() => {
                      if (!startDate || !endDate) return '-';
                      const [startY, startM] = startDate.split('.');
                      const [endY, endM] = endDate.split('.');
                      return `${startY.slice(2)}.${startM}. - ${endY.slice(2)}.${endM}.`;
                    })()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 시작 년월 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              시작 년월 <Text style={{ color: '#EF5252' }}>*</Text>
            </Text>
            <Pressable onPress={handleCalendarPress}>
              <View style={[styles.disabledCard, { backgroundColor: 'rgba(144, 146, 158, 0.12)' }]}>
                <View style={styles.yearMonthRow}>
                  <View style={styles.yearMonthLeft}>
                    <Icon name="calendarMonth" variant="line" size={24} color="#bdbdbd" />
                    <Text style={[styles.disabledText, { color: '#bdbdbd' }]}>
                      {(() => {
                        if (!startDate) return '';
                        const [year, month] = startDate.split('.');
                        return `${year}.${month}`;
                      })()}
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
              목표 금액
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
            <Pressable onPress={handleRecurringTogglePress}>
              <View style={[styles.disabledCard, { backgroundColor: colors.staticWhite }]}>
                <View style={styles.recurringSection}>
                  <View style={styles.recurringTitleRow}>
                    <Text style={[styles.switchLabel, { color: colors.text }]}>
                      챌린지 반복 여부
                    </Text>
                    <Switch
                      value={isRecurringChallenge}
                      onValueChange={() => {}}
                      disabled={true}
                    />
                  </View>
                  <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                    동일한 챌린지를 설정한 기간 동안 지속합니다.
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>

          {/* 개월 수 */}
          {isRecurringChallenge && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                개월 수
              </Text>
              <Pressable onPress={showDisabledToast}>
                <View style={[styles.disabledCard, { backgroundColor: 'rgba(144, 146, 158, 0.12)' }]}>
                  <View style={styles.monthPickerRow}>
                    <Text style={[styles.disabledText, { color: '#bdbdbd' }]}>
                      시작 년월 부터 반복할 개월 수
                    </Text>
                    <View style={styles.monthPickerValue}>
                      <Text style={[styles.disabledText, { color: '#bdbdbd' }]}>
                        {recurringCount}개월
                      </Text>
                      <Icon name="arrowRight" variant="line" size={24} color="#bdbdbd" />
                    </View>
                  </View>
                </View>
              </Pressable>
            </View>
          )}
          </ScrollView>

          {isKeypadMounted && (
            <View style={styles.customKeypadOverlay} pointerEvents="box-none">
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
                <BlurView
                  intensity={16}
                  tint="light"
                  style={styles.customKeypadBlur}
                >
                  <View
                    pointerEvents="none"
                    style={[styles.customKeypadTint, { backgroundColor: keypadTintColor }]}
                  />
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
                </BlurView>
              </Animated.View>
            </View>
          )}

          {/* 하단 고정 버튼 */}
          <View style={[
            styles.bottomButtonContainer, 
            { 
              backgroundColor: colors.staticWhite,
              paddingBottom: 16 + insets.bottom 
            }
          ]}>
            <Button onPress={handleSave}>
              저장
            </Button>
          </View>

        {/* 삭제 확인 모달 */}
        <ModalPopup
          visible={showDeleteModal}
          confirmText="확인"
          cancelText="취소"
          onConfirm={confirmDelete}
          onCancel={() => {
            logChallengeEditEvent('btn', 'delete-cancel');
            setShowDeleteModal(false);
          }}
        >
          <Text style={[styles.modalText, { color: colors.text }]}>
            {isRecurringChallenge 
              ? '반복 챌린지입니다.\n모든 연관 챌린지가 함께 삭제됩니다.\n정말로 삭제하시겠습니까?'
              : '정말로 이 챌린지를 삭제하시겠습니까?'}
          </Text>
        </ModalPopup>

        </Animated.View>
        
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
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 24,
    paddingBottom: 24,
  },
  customKeypadOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: 'flex-end',
    zIndex: 100,
    elevation: 100,
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
  customKeypadTint: {
    ...StyleSheet.absoluteFillObject,
  },
  customKeypadContainer: {
    width: '100%',
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...Typography.body1.l.bold,
  },
  deleteText: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
  },
  challengeInfoCard: {
    borderRadius: 16,
    padding: 16,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryText: {
    ...Typography.body1.l.bold,
    fontSize: 21,
    lineHeight: 31.5,
  },
  ddayText: {
    ...Typography.body1.l.bold,
    fontSize: 21,
    lineHeight: 31.5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  statusText: {
    ...Typography.tiny.r.bold,
    fontSize: 12,
    lineHeight: 18,
  },
  modalText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  amountInfo: {
    gap: 4,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    ...Typography.body2.r.medium,
  },
  amountValue: {
    ...Typography.body1.l.bold,
  },
  disabledCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(144, 146, 158, 0.16)',
  },
  disabledText: {
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
  monthPickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
