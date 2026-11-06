/**
 * 홈 탭 Stack — 이후 홈 소유 상세를 여기로 옮길 자리.
 * 타임라인은 NativeTabs `hidden` 시 하단 inset이 줄어 보여
 * 루트 Stack에 둔다 (탭바를 덮는 기존 UX).
 */

import { ROOT_STACK_SCREEN_OPTIONS } from '@/constants/sub-stack-screen-options';
import { Stack } from 'expo-router';

export default function HomeStackLayout() {
  return (
    <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
