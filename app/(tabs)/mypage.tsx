/**
 * My Page Screen
 * 
 * User profile and settings screen
 */

import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSheetEvent } from '@/utils/create-sheet-event';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyPageScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const isFocused = useIsFocused();
  const router = useRouter();
  
  // 개발자 모드 상태
  const [devMode, setDevMode] = useState(false);

  // 테스트용 날짜 설정 함수
  const setTestDate = (year: number, month: number, day: number) => {
    if (__DEV__) {
      const testDate = new Date(year, month - 1, day);
      console.log('🧪 [테스트] 날짜 설정:', testDate.toISOString().split('T')[0]);
      
      // Date.now() 오버라이드
      const originalNow = Date.now;
      Date.now = () => testDate.getTime();
      
      // new Date() 오버라이드
      const OriginalDate = Date;
      (Date as any) = class extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(testDate);
          } else {
            // @ts-ignore - 테스트용 코드
            super(...args);
          }
        }
      };
      
      // 전역에 복원 함수 저장
      (window as any).restoreDate = () => {
        Date.now = originalNow;
        (Date as any) = OriginalDate;
        console.log('🧪 [테스트] 날짜 복원 완료');
      };
    }
  };

  // 날짜 복원 함수
  const restoreDate = () => {
    if ((window as any).restoreDate) {
      (window as any).restoreDate();
    }
  };

  // 개발자 모드 상태를 AsyncStorage에 저장
  useEffect(() => {
    const loadDevMode = async () => {
      try {
        const savedDevMode = await AsyncStorage.getItem('devMode');
        if (savedDevMode !== null) {
          setDevMode(JSON.parse(savedDevMode));
        }
      } catch (error) {
        console.log('⚠️ 개발자 모드 상태 로드 실패:', error);
      }
    };
    loadDevMode();
  }, []);

  // 개발자 모드 상태 변경 시 AsyncStorage에 저장
  const handleDevModeChange = async (value: boolean) => {
    setDevMode(value);
    try {
      await AsyncStorage.setItem('devMode', JSON.stringify(value));
      console.log('✅ [개발자] 모드 상태 저장:', value);
    } catch (error) {
      console.log('⚠️ 개발자 모드 상태 저장 실패:', error);
    }
  };
  
  // 화면 진입 시에만 로그 출력
  useEffect(() => {
    console.log('📍 [화면] 마이페이지');
  }, []);
  
  // Create bottom sheet state
  const [isCreateSheetVisible, setIsCreateSheetVisible] = useState(false);
  
  // Listen for create tab press (only when focused)
  useEffect(() => {
    const unsubscribe = createSheetEvent.subscribe(() => {
      // Only show sheet if this screen is currently focused
      if (isFocused) {
        setIsCreateSheetVisible(true);
      }
    });
    
    return unsubscribe;
  }, [isFocused]);

  // Auto-close bottom sheet when navigating away from this screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup when losing focus (navigating to another screen)
        setIsCreateSheetVisible(false);
      };
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>마이페이지</Text>
        <Text style={[styles.subtitle, { color: colors.textAssistive }]}>
          프로필 및 설정을 관리할 수 있는 화면입니다.
        </Text>

        {/* 개발자 모드 토글 (개발 모드에서만) */}
        {__DEV__ && (
          <View style={[styles.devModeContainer, { backgroundColor: colors.fill }]}>
            <Text style={[styles.devModeText, { color: colors.text }]}>🧪 개발자 모드</Text>
            <Switch
              value={devMode}
              onValueChange={handleDevModeChange}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={devMode ? colors.staticWhite : colors.textAssistive}
            />
          </View>
        )}

        {/* 개발자 모드 날짜 조정 (개발자 모드가 켜져있을 때만) */}
        {__DEV__ && devMode && (
          <View style={[styles.dateAdjustContainer, { backgroundColor: colors.fill }]}>
            <Text style={[styles.dateAdjustTitle, { color: colors.text }]}>📅 날짜 조정</Text>
            
            {/* 첫 번째 행 */}
            <View style={styles.dateButtonRow}>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => {
                  setTestDate(2025, 10, 17);
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>현재</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>2025.10</Text>
              </Pressable>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => {
                  setTestDate(2025, 12, 17);
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>2개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>2025.12</Text>
              </Pressable>
            </View>

            {/* 두 번째 행 */}
            <View style={styles.dateButtonRow}>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => {
                  setTestDate(2026, 3, 17);
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>5개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>2026.03</Text>
              </Pressable>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => {
                  setTestDate(2026, 5, 17);
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>7개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>2026.05</Text>
              </Pressable>
            </View>

            {/* 세 번째 행 */}
            <View style={styles.dateButtonRow}>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => {
                  setTestDate(2026, 6, 17);
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>8개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>2026.06</Text>
              </Pressable>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => {
                  setTestDate(2026, 7, 17);
                }}
              >
                <Text style={[styles.dateButtonText, { color: colors.text }]}>9개월후</Text>
                <Text style={[styles.dateButtonSubText, { color: colors.textAssistive }]}>2026.07</Text>
              </Pressable>
            </View>

            {/* 복원 버튼 */}
            <View style={styles.restoreButtonContainer}>
              <Pressable
                style={[styles.restoreButton, { backgroundColor: '#ff6b6b' }]}
                onPress={() => {
                  restoreDate();
                }}
              >
                <Text style={[styles.restoreButtonText, { color: colors.staticWhite }]}>🔄 날짜 복원</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Create Bottom Sheet */}
      <ModalBottomsheet
        visible={isCreateSheetVisible}
        title="기록/챌린지"
        onClose={() => setIsCreateSheetVisible(false)}
        closeOnBackdrop={true}
      >
        <View style={styles.optionsContainer}>
          {/* 입금 기록 */}
          <Pressable 
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={() => {
              setIsCreateSheetVisible(false);
              setTimeout(() => {
                router.push('/income-record');
              }, 350);
            }}
          >
            <Text style={[styles.optionText, { color: colors.text }]}>
              💰 입금 기록
            </Text>
          </Pressable>

          {/* 소비 기록 */}
          <Pressable 
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={() => {
              setIsCreateSheetVisible(false);
              router.push('/expense-category');
            }}
          >
            <Text style={[styles.optionText, { color: colors.text }]}>
              💸 소비 기록
            </Text>
          </Pressable>

          {/* 데이터 삭제 (개발자 모드에서만) */}
          {__DEV__ && devMode && (
            <Pressable 
              style={[styles.option, { backgroundColor: colors.fill, borderColor: '#ff6b6b', borderWidth: 1 }]}
              onPress={async () => {
                setIsCreateSheetVisible(false);
                try {
                  // calendarData 키만 삭제 (더 안전한 방법)
                  await AsyncStorage.removeItem('calendarData');
                  console.log('✅ [개발자] calendarData 삭제됨');
                  alert('데이터가 삭제되었습니다.');
                } catch (error) {
                  console.log('⚠️ [개발자] 데이터 삭제 중 에러:', error);
                  alert('데이터 삭제 중 오류가 발생했습니다.');
                }
              }}
            >
              <Text style={[styles.optionText, { color: '#ff6b6b' }]}>
                🗑️ 데이터 삭제 (개발자)
              </Text>
            </Pressable>
          )}

          {/* 데이터 삭제 (일반 모드) */}
          {!(__DEV__ && devMode) && (
            <Pressable 
              style={[styles.option, { backgroundColor: colors.fill, borderColor: '#ff6b6b', borderWidth: 1 }]}
              onPress={async () => {
                setIsCreateSheetVisible(false);
                try {
                  // calendarData 키만 삭제 (더 안전한 방법)
                  await AsyncStorage.removeItem('calendarData');
                  console.log('✅ [일반] calendarData 삭제됨');
                  alert('데이터가 삭제되었습니다.');
                } catch (error) {
                  console.log('⚠️ [일반] 데이터 삭제 중 에러:', error);
                  alert('데이터 삭제 중 오류가 발생했습니다.');
                }
              }}
            >
              <Text style={[styles.optionText, { color: '#ff6b6b' }]}>
                🗑️ 데이터 삭제
              </Text>
            </Pressable>
          )}
        </View>
      </ModalBottomsheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    ...Typography.headline1.xl.bold,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body1.l.medium,
    textAlign: 'center',
  },
  // 개발자 모드 스타일
  devModeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    borderStyle: 'dashed',
  },
  devModeText: {
    ...Typography.body1.l.medium,
    fontWeight: 'bold',
  },
  // 날짜 조정 스타일
  dateAdjustContainer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    borderStyle: 'dashed',
  },
  dateAdjustTitle: {
    ...Typography.body1.l.medium,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  dateButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  dateButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  dateButtonText: {
    ...Typography.body2.r.medium,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  dateButtonSubText: {
    ...Typography.detail.r.regular,
    fontSize: 10,
  },
  restoreButtonContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  restoreButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  restoreButtonText: {
    ...Typography.body2.r.medium,
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Bottom sheet styles
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
