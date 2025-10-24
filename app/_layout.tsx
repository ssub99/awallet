import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  return (
    <View style={{ flex: 1, backgroundColor: colors.staticWhite }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="expense-category" options={{ headerShown: false }} />
        <Stack.Screen name="expense-record" options={{ headerShown: false }} />
        <Stack.Screen name="expense-edit" options={{ headerShown: false }} />
        <Stack.Screen name="income-record" options={{ headerShown: false }} />
        <Stack.Screen name="monthly-expense-timeline" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </View>
  );
}
