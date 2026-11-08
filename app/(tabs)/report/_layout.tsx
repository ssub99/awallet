/**
 * 리포트 탭 Stack — 이후 탭 소유 상세를 여기로 옮길 자리.
 */

import { ROOT_STACK_SCREEN_OPTIONS } from '@/constants/sub-stack-screen-options';
import { Stack } from 'expo-router';

export default function ReportStackLayout() {
  return (
    <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
