import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { Colors } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface CreateSheetContextValue {
  updateCalendarContext: (context: {
    selectedDate: string;
    calendarYear: number;
    calendarMonth: number;
  }) => void;
}

const CreateSheetContext = createContext<CreateSheetContextValue | undefined>(undefined);

const getTodayContext = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = String(now.getDate()).padStart(2, '0');
  const monthString = String(month).padStart(2, '0');

  return {
    selectedDate: `${year}-${monthString}-${day}`,
    calendarYear: year,
    calendarMonth: month,
  };
};

export const CreateSheetProvider = ({ children }: PropsWithChildren) => {
  const [isVisible, setIsVisible] = useState(false);
  const [calendarContext, setCalendarContext] = useState(getTodayContext);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  useEffect(() => {
    return createSheetEvent.subscribe(() => {
      setIsVisible(true);
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
  }, []);

  const navigateWithDelay = useCallback(
    (pathname: string, params: Record<string, string | undefined>) => {
      setIsVisible(false);
      setTimeout(() => {
        router.push({
          pathname,
          params,
        });
      }, 350);
    },
    [router]
  );

  const handleIncomePress = useCallback(() => {
    navigateWithDelay('/expense-category', {
      type: 'income',
      selectedDate: calendarContext.selectedDate,
      calendarYear: calendarContext.calendarYear.toString(),
      calendarMonth: calendarContext.calendarMonth.toString(),
    });
  }, [navigateWithDelay, calendarContext]);

  const handleExpensePress = useCallback(() => {
    navigateWithDelay('/expense-category', {
      selectedDate: calendarContext.selectedDate,
      calendarYear: calendarContext.calendarYear.toString(),
      calendarMonth: calendarContext.calendarMonth.toString(),
    });
  }, [navigateWithDelay, calendarContext]);

  const handleChallengePress = useCallback(() => {
    navigateWithDelay('/expense-category', {
      mode: 'challenge',
      // 캘린더에서 선택한 위치 그대로 사용 (소비 기록 생성과 동일한 로직)
      selectedDate: calendarContext.selectedDate,
      calendarYear: calendarContext.calendarYear.toString(),
      calendarMonth: calendarContext.calendarMonth.toString(),
    });
  }, [navigateWithDelay, calendarContext]);

  const value = useMemo<CreateSheetContextValue>(
    () => ({
      updateCalendarContext: (context) => {
        setCalendarContext((prev) => {
          const nextContext = {
            selectedDate: context.selectedDate || prev.selectedDate,
            calendarYear: context.calendarYear,
            calendarMonth: context.calendarMonth,
          };
          if (
            prev.selectedDate === nextContext.selectedDate &&
            prev.calendarYear === nextContext.calendarYear &&
            prev.calendarMonth === nextContext.calendarMonth
          ) {
            return prev;
          }
          return nextContext;
        });
      },
    }),
    []
  );

  return (
    <CreateSheetContext.Provider value={value}>
      {children}
      <ModalBottomsheet
        visible={isVisible}
        title="기록/챌린지"
        onClose={handleClose}
        closeOnBackdrop
      >
        <View style={styles.optionsContainer}>
          <Pressable
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={handleIncomePress}
            accessibilityRole="button"
            accessibilityLabel="수입 기록 화면으로 이동"
          >
            <Text style={[styles.optionText, { color: colors.text }]}>💰 수입 기록</Text>
          </Pressable>

          <Pressable
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={handleExpensePress}
            accessibilityRole="button"
            accessibilityLabel="소비 기록 화면으로 이동"
          >
            <Text style={[styles.optionText, { color: colors.text }]}>💸 소비 기록</Text>
          </Pressable>

          <Pressable
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={handleChallengePress}
            accessibilityRole="button"
            accessibilityLabel="챌린지 도전 화면으로 이동"
          >
            <Text style={[styles.optionText, { color: colors.text }]}>🎯 챌린지 도전</Text>
          </Pressable>
        </View>
      </ModalBottomsheet>
    </CreateSheetContext.Provider>
  );
};

export const useCreateSheetContext = (): CreateSheetContextValue => {
  const context = useContext(CreateSheetContext);
  if (!context) {
    throw new Error('useCreateSheetContext must be used within CreateSheetProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  optionsContainer: {
    gap: 8,
  },
  option: {
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  optionText: {
    ...Typography.body1.l.regular,
  },
});


