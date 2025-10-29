import { Button } from '@/components/ui/button';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignupCompleteScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top','bottom']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

        {/* Top Navigation */}
        <View style={[styles.topNavigation, { backgroundColor: colors.background }]}>
          <View style={styles.topNavigationContent}>
            <View style={styles.placeholder} />
            <Text style={[styles.pageTitle, { color: colors.text }]}>회원가입 완료</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <View style={[styles.main, { backgroundColor: colors.fill }]}>
          {/* Emoji in circle */}
          <View style={[styles.emojiWrap, { backgroundColor: colors.staticWhite }]}>
            <Text style={styles.emoji} accessibilityRole="image" accessibilityLabel="박수 이모지">👏🏻</Text>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>회원가입이 완료되었습니다.</Text>
          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: colors.textNeutral }]}>회원이 되신 것을 환영합니다.{Platform.OS === 'ios' ? '\n' : '\n'}더욱 쉽고 간편하게 소비를 기록하세요.</Text>

          {/* Button */}
          <View style={styles.buttonArea}>
            <Button onPress={() => router.replace('/')}>
              홈으로
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNavigation: { height: 56 },
  topNavigationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  pageTitle: { ...Typography.body1.l.bold },
  placeholder: { width: 32, height: 32 },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.16 },

  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 96,
    paddingBottom: 32,
    gap: 24,
    alignItems: 'center',
  },
  emojiWrap: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 72, lineHeight: 72 },
  title: { ...Typography.headline4.r.bold, textAlign: 'center' },
  subtitle: { ...Typography.body1.l.regular, textAlign: 'center' },
  buttonArea: { marginTop: 'auto', alignSelf: 'stretch' },
});


