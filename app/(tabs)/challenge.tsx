/**
 * Challenge Tab Screen
 *
 * 챌린지 탭 진입 시 표시되는 화면. 챌린지 현황은 월별 지출 타임라인 화면의 '챌린지 현황' 탭에서 확인합니다.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChallengeTabScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const handleOpenChallengeStatus = () => {
    router.push({
      pathname: '/monthly-expense-timeline',
      params: { tab: 'challenge' },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <TopNavigation title="챌린지" />
      <View style={styles.content}>
        <Text style={[Typography.body1.l.regular, { color: colors.text }]}>
          월별 챌린지 진행 현황을 확인할 수 있어요.
        </Text>
        <Button
          title="챌린지 현황 보기"
          onPress={handleOpenChallengeStatus}
          accessibilityLabel="챌린지 현황 보기"
        />
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
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
  },
});
