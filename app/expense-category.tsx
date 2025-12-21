/**
 * Expense Category Selection Screen
 * 
 * Allows users to select a category for their expense record.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { Toast } from '@/components/ui/toast';
import { getCategoriesByType, type Category } from '@/constants/categories';
import { loadCategories } from '@/utils/categories';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { applySavedOrder, loadCategoryOrder } from '@/utils/category-order';
import { getAllChallenges } from '@/utils/challenges';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExpenseCategoryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const params = useLocalSearchParams<{ 
    selectedCategory?: string; 
    fromEdit?: string; 
    recordId?: string; 
    dateKey?: string; 
    selectedDate?: string; 
    mode?: string;
    calendarYear?: string;
    calendarMonth?: string;
  }>();
  
  const [selectedCategory, setSelectedCategory] = useState<string>(
    params.selectedCategory || ''
  );
  
  // 카테고리 리스트 (저장된 순서 적용)
  const [categories, setCategories] = useState<Category[]>(() => {
    // 초기에는 기본 카테고리로 빠르게 표시
    return getCategoriesByType('expense');
  });
  
  // 화면 진입 시 저장된 순서 불러와서 적용
  useFocusEffect(
    useCallback(() => {
      const loadCategories = async () => {
        const loadedCategories = await loadCategories('expense');
        const savedOrder = await loadCategoryOrder('expense');
        
        if (savedOrder && savedOrder.length > 0) {
          const orderedCategories = applySavedOrder(loadedCategories, savedOrder);
          setCategories(orderedCategories);
        } else {
          setCategories(loadedCategories);
        }
      };
      
      loadCategories();
    }, [])
  );
  
  // 화면 진입 시에만 로그 출력
  useEffect(() => {
    console.log('🔍 [카테고리 선택] 파라미터 확인:', {
      selectedDate: params.selectedDate,
      calendarYear: params.calendarYear,
      calendarMonth: params.calendarMonth,
      mode: params.mode,
      selectedCategory: params.selectedCategory
    });
  }, [params.calendarMonth, params.calendarYear, params.mode, params.selectedCategory, params.selectedDate]);
  
  // 수정 모드인지 확인 (소비 기록 상세에서 온 경우)
  const isEditMode = params.fromEdit === 'true';
  
  // 챌린지 모드인지 확인
  const isChallengeMode = params.mode === 'challenge';
  
  // 챌린지 재선택 모드인지 확인 (챌린지 생성 화면에서 카테고리 재선택)
  const isChallengeReSelectMode = isChallengeMode && !!params.selectedCategory;

  // 타이틀 통일: 모든 모드에서 "카테고리 선택"
  const screenTitle = '카테고리 선택';

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const handleConfirm = async () => {

    if (selectedCategory) {
      if (isEditMode) {
        // 수정 모드: 임시 저장소에 선택된 카테고리 저장하고 이전 화면으로 돌아가기

        await AsyncStorage.setItem('selectedCategory', selectedCategory);

        router.back();
      } else if (isChallengeReSelectMode) {
        // 챌린지 재선택 모드: 중복 챌린지 검증 후 챌린지 생성 화면으로 이동
        try {
          // 기존 챌린지 존재 여부 체크 (같은 카테고리)
          const existingChallenges = await getAllChallenges();
          const activeChallenges = existingChallenges.filter(
            (challenge) => 
              !challenge.isDeleted && 
              challenge.category === selectedCategory
          );
          
          // 같은 카테고리의 활성 챌린지가 하나라도 존재하면 생성 불가
          if (activeChallenges.length > 0) {
            setToastMessage('선택하신 챌린지는 이미 생성되어 있습니다.');
            setToastVisible(true);
            return;
          }
          
          // 중복이 없으면 AsyncStorage에 저장하고 이전 화면으로 돌아가기 (화면 스택 쌓이지 않도록 back 사용)
          await AsyncStorage.setItem('selectedCategory', selectedCategory);
          router.back();
        } catch (error) {
          console.error('[카테고리 선택] 챌린지 검증 중 오류:', error);
          setToastMessage('챌린지 검증 중 오류가 발생했습니다.');
          setToastVisible(true);
        }
      } else {
        // 신규 등록 모드: 소비 기록 상세 화면으로 이동 (카테고리와 선택된 날짜 전달)

        router.push({
          pathname: '/expense-record',
          params: { 
            category: selectedCategory,
            selectedDate: params.selectedDate,
            calendarYear: params.calendarYear,
            calendarMonth: params.calendarMonth
          },
        });
      }
    } else {
      setToastMessage('카테고리를 선택해 주세요.');
      setToastVisible(true);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Top Navigation */}
      <TopNavigation
        type="sub"
        title={screenTitle}
        showLeftIcon
        onLeftIconPress={handleBack}
        showRightButton={isEditMode || isChallengeReSelectMode}
        rightButtonText="확인"
        onRightButtonPress={handleConfirm}
      />

      {/* Category List */}
      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {categories.map((category, index) => (
              <View key={category.label}>
                <Pressable
                  style={styles.categoryItem}
                  onPress={async () => {
                    setSelectedCategory(category.label);
                    
                    // 챌린지 신규 선택 모드일 때: 중복 챌린지 검증 후 챌린지 생성 화면으로 이동
                    if (isChallengeMode && !isChallengeReSelectMode) {
                      try {
                        // 기존 챌린지 존재 여부 체크 (같은 카테고리)
                        const existingChallenges = await getAllChallenges();
                        const activeChallenges = existingChallenges.filter(
                          (challenge) => 
                            !challenge.isDeleted && 
                            challenge.category === category.label
                        );
                        
                        // 같은 카테고리의 활성 챌린지가 하나라도 존재하면 생성 불가
                        if (activeChallenges.length > 0) {
                          setToastMessage('선택하신 챌린지는 이미 생성되어 있습니다.');
                          setToastVisible(true);
                          setSelectedCategory(''); // 선택 취소
                          return;
                        }
                        
                        // 중복이 없으면 챌린지 생성 화면으로 이동
                        router.push({
                          pathname: '/challenge-create',
                          params: { 
                            category: category.label,
                            selectedDate: params.selectedDate,
                            calendarYear: params.calendarYear,
                            calendarMonth: params.calendarMonth
                          },
                        });
                      } catch (error) {
                        console.error('[카테고리 선택] 챌린지 검증 중 오류:', error);
                        setToastMessage('챌린지 검증 중 오류가 발생했습니다.');
                        setToastVisible(true);
                      }
                    } 
                    // 챌린지 재선택 모드일 때: 선택만 하고 확인 버튼으로 이동
                    // (확인 버튼에서 중복 검증 수행)
                    // 신규 등록 모드일 때: 카테고리 선택 시 바로 다음 화면으로 이동
                    else if (!isEditMode && !isChallengeReSelectMode) {
                      router.push({
                        pathname: '/expense-record',
                        params: { 
                          category: category.label,
                          selectedDate: params.selectedDate,
                          calendarYear: params.calendarYear,
                          calendarMonth: params.calendarMonth
                        },
                      });
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.label} 선택`}
                >
                  <View style={styles.categoryContent}>
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                    <Text style={[styles.categoryLabel, { color: colors.text }]}>
                      {category.label}
                    </Text>
                  </View>
                  
                  {selectedCategory === category.label && (
                    <View style={styles.checkIcon}>
                      <Icon name="check" variant="line" size={24} color={colors.primary} />
                    </View>
                  )}
                </Pressable>
                
                {/* Divider (마지막 항목 제외) */}
                {index < categories.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onHide={() => setToastVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryEmoji: {
    fontSize: 21,
    lineHeight: 31.5,
    width: 21,
    textAlign: 'center',
  },
  categoryLabel: {
    ...Typography.body1.l.regular,
  },
  checkIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    marginLeft: 16,
  },
});

