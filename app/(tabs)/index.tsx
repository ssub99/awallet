/**
 * Temporary Placeholder - Hidden from Tab Bar
 *
 * This file exists to prevent routing errors.
 * Redirects to home screen.
 * 앱 진입 앵커는 루트 `onboarding` — 온보딩 완료 후 /home 으로 진입.
 */

import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/home" />;
}
