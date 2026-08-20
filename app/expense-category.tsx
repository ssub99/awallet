/**
 * Category Selection Screen (지출/수입 공용)
 * 
 * Allows users to select a category for their expense or income record.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { UiLineText } from '@/components/ui/ui-line-text';
import { getCategoriesByType, type Category } from '@/constants/categories';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import {
  EXPENSE_RECORD_SCREEN_FUNNEL_ROUTE_PARAMS,
} from '@/utils/expense-record-creation-mode';
import { getAllChallenges, type ChallengeRecord } from '@/utils/challenges';
import { applySavedOrder, loadCategoryOrder } from '@/utils/category-order';
import { loadCategories } from '@/utils/categories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExpenseCategoryScreen() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ 
    selectedCategory?: string; 
    fromEdit?: string; 
    recordId?: string; 
    dateKey?: string; 
    selectedDate?: string; 
    mode?: string;
    calendarYear?: string;
    calendarMonth?: string;
    type?: string;
  }>();

  const categoryType = (params.type === 'income' ? 'income' : 'expense') as 'income' | 'expense';
  
  const [selectedCategory, setSelectedCategory] = useState<string>(
    params.selectedCategory || ''
  );
  
  // 카테고리 리스트 (저장된 순서 적용)
  const [categories, setCategories] = useState<Category[]>(() => {
    // 초기에는 기본 카테고리로 빠르게 표시
    return getCategoriesByType(categoryType);
  });
  
  // 화면 진입 시 저장된 순서 불러와서 적용
  useFocusEffect(
    useCallback(() => {
      const loadCategoriesData = async () => {
        const loadedCategories = await loadCategories(categoryType);
        const savedOrder = await loadCategoryOrder(categoryType);
        
        if (savedOrder && savedOrder.length > 0) {
          const orderedCategories = applySavedOrder(loadedCategories, savedOrder);
          setCategories(orderedCategories);
        } else {
          setCategories(loadedCategories);
        }
      };
      
      loadCategoriesData();
    }, [categoryType])
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
  const flowMode: 'income' | 'expense' | 'challenge' = isChallengeMode
    ? 'challenge'
    : categoryType;
  
  // 챌린지 재선택 모드인지 확인 (챌린지 생성 화면에서 카테고리 재선택)
  const isChallengeReSelectMode = isChallengeMode && !!params.selectedCategory;

  // 타이틀: 수입/지출 구분
  const screenTitle = categoryType === 'income' ? '수입 카테고리 선택' : '카테고리 선택';

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (!toastVisible) {
      return;
    }
    showToast(toastMessage);
    setToastVisible(false);
  }, [showToast, toastMessage, toastVisible]);

  const handleConfirm = async () => {
    void logEvent('btn', {
      screen_name: '/expense-category',
      target: 'category-option-confirm',
      mode: flowMode,
      category_type: categoryType,
      category: selectedCategory ?? null,
    });

    if (selectedCategory) {
      if (isEditMode) {
        // 수정 모드: 임시 저장소에 선택된 카테고리 저장하고 이전 화면으로 돌아가기
        await AsyncStorage.setItem('selectedCategory', selectedCategory);

        router.back();
      } else if (isChallengeReSelectMode) {
        // 챌린지 재선택 모드: 카테고리 저장 후 챌린지 생성 화면으로 복귀 (기간 겹침 검증은 challenge-create에서 수행)
        await AsyncStorage.setItem('selectedCategory', selectedCategory);
        router.back();
      } else {
        // 신규 등록 모드: 지출/수입 기록 화면으로 이동 (카테고리와 선택된 날짜 전달)
        const pathname = categoryType === 'income' ? '/income-record' : '/expense-record';
        router.push({
          pathname,
          params: { 
            category: selectedCategory,
            selectedDate: params.selectedDate,
            calendarYear: params.calendarYear,
            calendarMonth: params.calendarMonth,
            ...EXPENSE_RECORD_SCREEN_FUNNEL_ROUTE_PARAMS,
          },
        });
      }
    } else {
      setToastMessage('카테고리를 선택해 주세요.');
      setToastVisible(true);
    }
  };

  const handleBack = () => {
    void logEvent('btn', {
      screen_name: '/expense-category',
      target: 'category-option-prev',
      mode: flowMode,
      category_type: categoryType,
    });
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.staticWhite }]} edges={['top', 'bottom']}>
      
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
      <View style={[styles.content, { backgroundColor: palette.fill }]}>
        <View style={[styles.card, { backgroundColor: palette.staticWhite }]}>
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            {categories.map((category, index) => (
              <View key={category.label}>
                <Pressable
                  style={styles.categoryItem}
                  onPress={async () => {
                    void logEvent('list', {
                      screen_name: '/expense-category',
                      target: 'category-option',
                      mode: flowMode,
                      category_type: categoryType,
                      category: category.label,
                    });
                    // 챌린지 신규 선택 모드일 때: 기존 챌린지 기간 겹침 체크 후, 문제 없으면 선택 + 생성 화면으로 이동
                    if (isChallengeMode && !isChallengeReSelectMode) {
                      if (!params.selectedDate || !params.calendarYear || !params.calendarMonth) {
                        setToastMessage('캘린더 위치 정보를 불러오지 못했습니다.');
                        setToastVisible(true);
                        return;
                      }

                      try {
                        const year = parseInt(params.calendarYear, 10);
                        const month = parseInt(params.calendarMonth, 10);

                        // 선택된 월의 시작/끝 날짜 계산 (소비/챌린지 공통 로직과 동일한 방식 유지)
                        const monthStartDate = new Date(year, month - 1, 1);
                        const nextMonthStartDate = new Date(year, month, 1);
                        const monthEndDate = new Date(nextMonthStartDate.getTime() - 24 * 60 * 60 * 1000);

                        const startDateStr = `${monthStartDate.getFullYear()}.${String(monthStartDate.getMonth() + 1).padStart(2, '0')}.${String(monthStartDate.getDate()).padStart(2, '0')}`;
                        const endDateStr = `${monthEndDate.getFullYear()}.${String(monthEndDate.getMonth() + 1).padStart(2, '0')}.${String(monthEndDate.getDate()).padStart(2, '0')}`;

                        const isDateRangeOverlapping = (
                          newStart: string,
                          newEnd: string,
                          existingStart: string,
                          existingEnd: string
                        ): boolean => {
                          const newStartDate = new Date(newStart.replace(/\./g, '-'));
                          const newEndDate = new Date(newEnd.replace(/\./g, '-'));
                          const existingStartDate = new Date(existingStart.replace(/\./g, '-'));
                          const existingEndDate = new Date(existingEnd.replace(/\./g, '-'));
                          
                          return newStartDate <= existingEndDate && newEndDate >= existingStartDate;
                        };

                        const allChallenges = await getAllChallenges();
                        const activeChallenges: ChallengeRecord[] = allChallenges.filter(
                          (ch) => !ch.isDeleted && ch.category === category.label
                        );

                        const hasOverlap = activeChallenges.some((existing) =>
                          isDateRangeOverlapping(
                            startDateStr,
                            endDateStr,
                            existing.startDate,
                            existing.endDate
                          )
                        );

                        if (hasOverlap) {
                          setToastMessage('해당 기간에 선택하신 챌린지가 이미 존재합니다.');
                          setToastVisible(true);
                          return;
                        }
                      } catch (error) {
                        console.error('[expense-category] Failed to check challenge overlap:', error);
                        setToastMessage('챌린지 중복 여부 확인 중 오류가 발생했습니다.');
                        setToastVisible(true);
                        return;
                      }

                      // 중복이 없을 때만 선택 상태 반영
                      setSelectedCategory(category.label);

                      router.push({
                        pathname: '/challenge-create',
                        params: {
                          category: category.label,
                          selectedDate: params.selectedDate,
                          calendarYear: params.calendarYear,
                          calendarMonth: params.calendarMonth
                        },
                      });
                    } 
                    // 챌린지 재선택 모드일 때: 선택만 하고 확인 버튼으로 이동
                    // (확인 버튼에서 중복 검증 수행)
                    // 신규 등록 모드일 때: 카테고리 선택 시 바로 다음 화면으로 이동
                    else if (!isEditMode && !isChallengeReSelectMode) {
                      setSelectedCategory(category.label);
                      const targetPathname = categoryType === 'income' ? '/income-record' : '/expense-record';
                      router.push({
                        pathname: targetPathname,
                        params: { 
                          category: category.label,
                          selectedDate: params.selectedDate,
                          calendarYear: params.calendarYear,
                          calendarMonth: params.calendarMonth,
                          ...EXPENSE_RECORD_SCREEN_FUNNEL_ROUTE_PARAMS,
                        },
                      });
                    }
                    // 수정/챌린지 재선택 모드일 때: 선택 상태만 반영하고 상단 확인 버튼으로 저장
                    else if (isEditMode || isChallengeReSelectMode) {
                      setSelectedCategory(category.label);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.label} 선택`}
                >
                  <View style={styles.categoryContent}>
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                    <UiLineText style={[styles.categoryLabel, { color: palette.text }]}>
                      {category.label}
                    </UiLineText>
                  </View>
                  
                  {selectedCategory === category.label && (
                    <View style={styles.checkIcon}>
                      <Icon name="check" variant="line" size={24} color={palette.primary} />
                    </View>
                  )}
                </Pressable>
                
                {/* Divider (마지막 항목 제외) */}
                {index < categories.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: palette.border }]} />
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
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
    paddingBottom: 0,
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
    ...typography.headline04.bold,
    width: 21,
    textAlign: 'center',
  },
  categoryLabel: {
    
  },
  checkIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
});
