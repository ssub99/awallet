/**
 * Temporary Placeholder - Hidden from Tab Bar
 *
 * This file exists to prevent routing errors.
 * Redirects to home screen. (온보딩 게이트는 OnboardingLaunchGate)
 */

import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/home" />;
}
