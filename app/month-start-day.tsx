/**
 * Month Start Day Selection Screen
 * 
 * Allows users to select which day of the month should be considered
 * as the start of the month for calculations and displays
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MonthStartDayScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const navigation = useNavigation();
  
  const [selectedDay, setSelectedDay] = useState(1);
  const [initialDay, setInitialDay] = useState(1); // 원래 값 저장
  const scrollRef = useRef<ScrollView>(null);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Load saved month start day
  useEffect(() => {
    const loadMonthStartDay = async () => {
      try {
        const saved = await AsyncStorage.getItem('monthStartDay');
        if (saved) {
          // Extract number from saved value (e.g., "1일" -> 1)
          const dayNumber = parseInt(saved.replace('일', ''));
          if (!isNaN(dayNumber) && dayNumber >= 1 && dayNumber <= 31) {
            setSelectedDay(dayNumber);
            setInitialDay(dayNumber); // 초기값도 저장
          }
        }
      } catch (error) {

      }
    };

    loadMonthStartDay();
  }, []);

  // 선택된 일자를 화면 중앙으로 스크롤
  useEffect(() => {
    if (!viewportHeight || !scrollRef.current || !selectedDay) return;
    // 행 높이(대략): 최소 56
    const rowHeight = 56;
    const dividerHeight = 1; // 마지막 제외
    const index = Math.max(0, Math.min(30, selectedDay - 1));
    const y = Math.max(0, index * (rowHeight + dividerHeight) - (viewportHeight - rowHeight) / 2);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
    });
  }, [viewportHeight, selectedDay]);

  // Save on screen exit (hardware back button or gesture)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', async (e) => {
      // 변경이 있으면 저장
      if (selectedDay !== initialDay) {
        try {
          await AsyncStorage.setItem('monthStartDay', `${selectedDay}일`);
          console.log('✅ 월 시작일 저장 (자동):', selectedDay);
        } catch (error) {

        }
      }
    });

    return unsubscribe;
  }, [navigation, selectedDay, initialDay]);

  const handleDaySelect = (day: number) => {
    setSelectedDay(day);
    console.log('📅 월 시작일 선택:', day, '(저장 대기 중)');
  };

  const handleBack = async () => {
    // 변경이 있으면 저장
    if (selectedDay !== initialDay) {
      try {
        await AsyncStorage.setItem('monthStartDay', `${selectedDay}일`);

      } catch (error) {

      }
    } else {

    }
    
    router.back();
  };

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.staticWhite }]} 
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Top Navigation */}
      <TopNavigation
        type="sub"
        title="월 시작일"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      {/* Content */}
      <View style={[styles.contentWrapper, { backgroundColor: colors.fill }]}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          ref={scrollRef}
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        >
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day, index) => (
              <View key={day}>
                <Pressable
                  style={styles.dayRow}
                  onPress={() => handleDaySelect(day)}
                  accessibilityRole="button"
                  accessibilityLabel={`${day}일 선택`}
                  accessibilityState={{ selected: selectedDay === day }}
                >
                  <Text style={[styles.dayText, { color: colors.text }]}>
                    {day}일
                  </Text>
                  
                  {selectedDay === day && (
                    <Icon name="check" size={24} color={colors.primary} />
                  )}
                </Pressable>
                
                {index < 30 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
  },
  dayText: {
    ...Typography.body1.l.regular,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
});

