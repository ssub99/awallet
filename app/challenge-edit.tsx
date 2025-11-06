/**
 * Challenge Edit Screen
 * 
 * Screen for editing an existing challenge.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Switch } from '@/components/ui/switch';
import { Toast } from '@/components/ui/toast';
import { EXPENSE_CATEGORIES } from '@/constants/categories';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
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

export default function ChallengeEditScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setLoading } = useLoading();
  const params = useLocalSearchParams<{ 
    challengeId?: string;
  }>();

  // Form state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [currentAmount, setCurrentAmount] = useState<number>(0);
  const [recurringId, setRecurringId] = useState<string>('');
  const [isRecurringChallenge, setIsRecurringChallenge] = useState<boolean>(false);
  const [recurringCount, setRecurringCount] = useState<number>(1);
  const [monthStartDay, setMonthStartDay] = useState<number>(1);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  
  // Toast state
  const [showToast, setShowToast] = useState<boolean>(false);
  
  // 토스트 표시 함수
  const showDisabledToast = () => {
    setShowToast(true);
  };

  // Load challenge data
  useEffect(() => {
    const loadChallengeData = async () => {
      if (!params.challengeId) {
        return;
      }
      
      // 월 시작일 로드
      const monthStart = await loadMonthStartDay();
      setMonthStartDay(monthStart);
      
      try {
        const storedData = await AsyncStorage.getItem('challengeData');
        
        if (storedData) {
          const challenges = JSON.parse(storedData);
          
          const challenge = challenges.find((c: ChallengeData) => c.id === params.challengeId);
          
          if (challenge) {
            
            // recurringId 확인 (없으면 자동 생성 - 이전 버전 호환성)
            if (!challenge.recurringId) {
              challenge.recurringId = challenge.id;
              const updatedChallenges = challenges.map((c: ChallengeData) => 
                c.id === challenge.id ? { ...c, recurringId: challenge.id } : c
              );
              await AsyncStorage.setItem('challengeData', JSON.stringify(updatedChallenges));
            }
            
            // 반복 챌린지 여부 확인
            const relatedChallenges = challenges.filter((c: ChallengeData) => 
              c.recurringId === challenge.recurringId
            );
            const isRecurring = relatedChallenges.length > 1;

            setRecurringCount(relatedChallenges.length);
            
            // 종료일이 잘못된 경우 자동 수정 (시작일 + 31일)
            const startDateParts = challenge.startDate.split('.');
            if (startDateParts.length === 3) {
              const year = parseInt(startDateParts[0]);
              const month = parseInt(startDateParts[1]) - 1;
              const day = parseInt(startDateParts[2]);
              
              const nextMonthSameDay = new Date(year, month + 1, day);
              const correctEndDateObj = new Date(nextMonthSameDay.getTime() - 24 * 60 * 60 * 1000);
              const correctEndYear = correctEndDateObj.getFullYear();
              const correctEndMonth = correctEndDateObj.getMonth() + 1;
              const correctEndDay = correctEndDateObj.getDate();
              const correctEndDate = `${correctEndYear}.${String(correctEndMonth).padStart(2, '0')}.${String(correctEndDay).padStart(2, '0')}`;

              // 종료일이 다르면 자동으로 DB 업데이트
              if (challenge.endDate !== correctEndDate) {
                const updatedChallenges = challenges.map((c: ChallengeData) => 
                  c.id === challenge.id ? { ...c, endDate: correctEndDate } : c
                );
                await AsyncStorage.setItem('challengeData', JSON.stringify(updatedChallenges));
                challenge.endDate = correctEndDate; // 현재 객체도 업데이트
              }
            }
            
            setStartDate(challenge.startDate);
            setEndDate(challenge.endDate);
            setTargetAmount(challenge.targetAmount.toLocaleString());
            setCategory(challenge.category);
            setRecurringId(challenge.recurringId);
            setIsRecurringChallenge(isRecurring);
            
            // 현재 소비금액 계산
            const currentAmount = await calculateCurrentAmount(challenge);
            setCurrentAmount(currentAmount);
          }
        }
      } catch (error) {

      }
    };

    loadChallengeData();
  }, [params.challengeId]);

  // 현재 소비금액 계산
  const calculateCurrentAmount = async (challenge: ChallengeData): Promise<number> => {
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
    } catch (error) {

      return 0;
    }
  };

  // 금액 입력 시 처리하는 함수
  const handleAmountChange = (text: string) => {
    const numbersOnly = text.replace(/[^0-9]/g, '');
    
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

  const handleSave = async () => {
    // 필수값 검증
    if (!targetAmount || targetAmount === '0' || targetAmount.trim() === '') {
      Alert.alert('알림', '목표 소비 금액을 입력해주세요.');
      return;
    }
    
    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('challengeData');
      const challenges: ChallengeData[] = storedData ? JSON.parse(storedData) : [];
      
      const targetAmountNum = parseFloat(targetAmount.replace(/,/g, ''));

      // recurringId가 같은 모든 챌린지 업데이트
      const updatedChallenges = challenges.map((c: ChallengeData) => {
        if (c.recurringId === recurringId) {

          return {
            ...c,
            targetAmount: targetAmountNum,
          };
        }
        return c;
      });
      
      const updatedCount = updatedChallenges.filter(c => c.recurringId === recurringId).length;

      // AsyncStorage에 저장
      await AsyncStorage.setItem('challengeData', JSON.stringify(updatedChallenges));

      // 챌린지 현황으로 이동
      router.back();
      setTimeout(() => {
        router.replace({
          pathname: '/monthly-expense-timeline',
          params: {
            year: new Date().getFullYear().toString(),
            month: (new Date().getMonth() + 1).toString(),
            tab: 'challenge'
          },
        });
      }, 100);
    } catch (error) {
      console.error('[챌린지 수정] error:', error);
      Alert.alert('오류', '챌린지 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    setLoading(true);
    try {

      const storedData = await AsyncStorage.getItem('challengeData');
      if (storedData) {
        const challenges: ChallengeData[] = JSON.parse(storedData);

        // recurringId가 같은 모든 챌린지 찾기
        const challengesToDelete = challenges.filter((c: ChallengeData) => c.recurringId === recurringId);
        console.log('🗑️ [챌린지 삭제] 삭제할 챌린지 목록:', challengesToDelete.map(c => ({
          id: c.id,
          startDate: c.startDate,
          category: c.category
        })));
        
        // recurringId가 다른 챌린지만 남기기 (같은 recurringId 모두 삭제)
        const filteredChallenges = challenges.filter((c: ChallengeData) => c.recurringId !== recurringId);

        console.log('🗑️ [챌린지 삭제] 남은 챌린지:', filteredChallenges.map((c: ChallengeData) => `${c.id}: ${c.category}`).join(', '));
        
        await AsyncStorage.setItem('challengeData', JSON.stringify(filteredChallenges));

        setShowDeleteModal(false);
        
        // 챌린지 현황으로 이동
        router.back();
        setTimeout(() => {
          router.replace({
            pathname: '/monthly-expense-timeline',
            params: {
              year: new Date().getFullYear().toString(),
              month: (new Date().getMonth() + 1).toString(),
              tab: 'challenge'
            },
          });
        }, 100);
      }
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
        <TopNavigation
          type="sub"
          title="챌린지 수정"
          showLeftIcon
          onLeftIconPress={handleBack}
        />

        <ScrollView 
          style={[styles.content, { backgroundColor: colors.fill }]}
          contentContainerStyle={styles.contentContainer}
        >
          {/* 챌린지 정보 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                챌린지 정보
              </Text>
              <Pressable onPress={handleDelete}>
                <Text style={[styles.deleteText, { color: colors.textAssistive }]}>
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
            <Pressable onPress={showDisabledToast}>
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
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              목표 금액
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
            <Pressable onPress={showDisabledToast}>
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
          onCancel={() => setShowDeleteModal(false)}
        >
          <Text style={[styles.modalText, { color: colors.text }]}>
            {isRecurringChallenge 
              ? '반복 챌린지입니다.\n모든 연관 챌린지가 함께 삭제됩니다.\n정말로 삭제하시겠습니까?'
              : '정말로 이 챌린지를 삭제하시겠습니까?'}
          </Text>
        </ModalPopup>

        {/* Toast */}
        <Toast
          message="변경할 수 없습니다. 새로 생성해 주세요."
          visible={showToast}
          onHide={() => setShowToast(false)}
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
});
