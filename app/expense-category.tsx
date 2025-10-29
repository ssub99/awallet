/**
 * Expense Category Selection Screen
 * 
 * Allows users to select a category for their expense record.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { EXPENSE_CATEGORIES } from '@/constants/categories';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

  const handleConfirm = async () => {

    if (selectedCategory) {
      if (isEditMode) {
        // 수정 모드: 임시 저장소에 선택된 카테고리 저장하고 이전 화면으로 돌아가기

        await AsyncStorage.setItem('selectedCategory', selectedCategory);

        router.back();
      } else if (isChallengeMode) {
        // 챌린지 모드: 챌린지 생성 화면으로 이동 (카테고리 전달)
        console.log('🔍 [카테고리 선택] 챌린지 생성으로 전달할 파라미터:', {
          category: selectedCategory,
          selectedDate: params.selectedDate,
          calendarYear: params.calendarYear,
          calendarMonth: params.calendarMonth
        });

        router.push({
          pathname: '/challenge-create',
          params: { 
            category: selectedCategory,
            selectedDate: params.selectedDate,
            calendarYear: params.calendarYear,
            calendarMonth: params.calendarMonth
          },
        });
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
        title="카테고리 선택"
        showLeftIcon
        onLeftIconPress={handleBack}
        showRightButton
        rightButtonText={isEditMode ? "확인" : "다음"}
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
            {EXPENSE_CATEGORIES.map((category, index) => (
              <View key={category.label}>
                <Pressable
                  style={styles.categoryItem}
                  onPress={() => {

                    setSelectedCategory(category.label);
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
                {index < EXPENSE_CATEGORIES.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
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

