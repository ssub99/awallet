/**
 * 챌린지∙통계 탭 Stack — 이후 탭 소유 상세를 여기로 옮길 자리.
 * challenge-detail 등 탭바를 가려야 하는 화면은 루트 Stack 유지.
 */

import { ROOT_STACK_SCREEN_OPTIONS } from '@/constants/sub-stack-screen-options';
import { Stack } from 'expo-router';

export default function ChallengeStackLayout() {
  return (
    <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
