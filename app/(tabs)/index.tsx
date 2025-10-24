/**
 * Temporary Placeholder - Hidden from Tab Bar
 * 
 * This file exists to prevent routing errors.
 * Redirects to home screen.
 */

import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect to home screen
  return <Redirect href="/home" />;
}

