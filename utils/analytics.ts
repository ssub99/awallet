import analytics from '@react-native-firebase/analytics';

/**
 * Firebase Analytics 이벤트 로깅
 */
export async function logEvent(eventName: string, params?: Record<string, any>): Promise<void> {
  try {
    await analytics().logEvent(eventName, params);
    if (__DEV__) {
      console.log(`📊 [Analytics] Event logged: ${eventName}`, params || {});
    }
  } catch (error) {
    console.warn(`[Analytics] Failed to log event ${eventName}:`, error);
  }
}

/**
 * Firebase Analytics 수집 활성화/비활성화
 */
export async function setAnalyticsCollectionEnabled(enabled: boolean): Promise<void> {
  try {
    await analytics().setAnalyticsCollectionEnabled(enabled);
    if (__DEV__) {
      console.log(`📊 [Analytics] Collection ${enabled ? 'enabled' : 'disabled'}`);
    }
  } catch (error) {
    console.warn('[Analytics] Failed to set collection enabled:', error);
  }
}

/**
 * 사용자 속성 설정
 */
export async function setUserProperty(name: string, value: string | null): Promise<void> {
  try {
    await analytics().setUserProperty(value, name);
    if (__DEV__) {
      console.log(`📊 [Analytics] User property set: ${name} = ${value}`);
    }
  } catch (error) {
    console.warn(`[Analytics] Failed to set user property ${name}:`, error);
  }
}

/**
 * 사용자 ID 설정
 */
export async function setUserId(userId: string | null): Promise<void> {
  try {
    await analytics().setUserId(userId);
    if (__DEV__) {
      console.log(`📊 [Analytics] User ID set: ${userId || '(null)'}`);
    }
  } catch (error) {
    console.warn('[Analytics] Failed to set user ID:', error);
  }
}

/**
 * 화면 추적
 */
export async function logScreenView(screenName: string, screenClass?: string): Promise<void> {
  try {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
    if (__DEV__) {
      console.log(`📊 [Analytics] Screen view: ${screenName}`);
    }
  } catch (error) {
    console.warn(`[Analytics] Failed to log screen view ${screenName}:`, error);
  }
}

/**
 * 개발 환경에서 DebugView 활성화
 * iOS: Xcode Scheme에서 -FIRAnalyticsDebugEnabled 플래그 필요
 */
export async function enableDebugMode(): Promise<void> {
  try {
    if (__DEV__) {
      // Analytics 수집 활성화
      await setAnalyticsCollectionEnabled(true);
      
      // 테스트 이벤트 발생 (DebugView 확인용)
      await logEvent('debug_view_test', {
        test_param: 'debug_mode_enabled',
        timestamp: Date.now(),
      });
      
      console.log('✅ Firebase Analytics DebugView 활성화됨');
      console.log('📊 Firebase Console > Analytics > DebugView에서 이벤트를 확인하세요');
      console.log('🔍 테스트 이벤트 "debug_view_test" 전송됨');
    }
  } catch (error) {
    console.warn('Analytics enableDebugMode error:', error);
  }
}

