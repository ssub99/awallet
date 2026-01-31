import Constants from 'expo-constants';

// 프로덕션(스토어 앱)에서만 Firebase Analytics 사용. 스테이지/Expo Go/개발빌드는 제외
const isProduction = Constants.executionEnvironment === 'storeClient';

let analytics: any = null;

// 프로덕션에서만 Firebase Analytics 로드 (스테이지 채널·Expo Go 제외)
if (isProduction) {
  try {
    analytics = require('@react-native-firebase/analytics').default;
  } catch (error) {
    console.warn('[Analytics] Firebase Analytics 모듈을 로드할 수 없습니다:', error);
  }
}

/**
 * Firebase Analytics 이벤트 로깅
 */
export async function logEvent(eventName: string, params?: Record<string, any>): Promise<void> {
  if (!isProduction || !analytics) {
    if (__DEV__) {
      console.log(`📊 [Analytics] (비프로덕션) Event skipped: ${eventName}`, params || {});
    }
    return;
  }
  
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
  if (!isProduction || !analytics) {
    if (__DEV__) {
      console.log(`📊 [Analytics] (비프로덕션) Collection skipped: ${enabled ? 'enabled' : 'disabled'}`);
    }
    return;
  }
  
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
  if (!isProduction || !analytics) {
    if (__DEV__) {
      console.log(`📊 [Analytics] (비프로덕션) User property skipped: ${name} = ${value}`);
    }
    return;
  }
  
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
  if (!isProduction || !analytics) {
    if (__DEV__) {
      console.log(`📊 [Analytics] (비프로덕션) User ID skipped: ${userId || '(null)'}`);
    }
    return;
  }
  
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
  if (!isProduction || !analytics) {
    if (__DEV__) {
      console.log(`📊 [Analytics] (비프로덕션) Screen view skipped: ${screenName}`);
    }
    return;
  }
  
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
  if (!isProduction) {
    if (__DEV__) {
      console.log('📊 [Analytics] 프로덕션(storeClient)에서만 DebugView를 사용할 수 있습니다.');
    }
    return;
  }
  
  try {
    if (__DEV__) {
      // Analytics 수집 활성화
      await setAnalyticsCollectionEnabled(true);
      
      if (!analytics) {
        console.warn('📊 [Analytics] Firebase Analytics 모듈을 사용할 수 없습니다.');
        return;
      }
      
      // Firebase Analytics 초기화 확인
      const analyticsInstance = analytics();
      console.log('📊 [Analytics] Firebase Analytics 인스턴스:', analyticsInstance ? '✅ 초기화됨' : '❌ 초기화 실패');
      
      // 테스트 이벤트 발생 (DebugView 확인용)
      await logEvent('debug_view_test', {
        test_param: 'debug_mode_enabled',
        timestamp: Date.now(),
      });
      
      // 추가 테스트 이벤트들
      await logEvent('analytics_initialized', {
        platform: 'ios',
        timestamp: Date.now(),
      });
      
      console.log('✅ Firebase Analytics DebugView 활성화됨');
      console.log('📊 Firebase Console > Analytics > DebugView에서 이벤트를 확인하세요');
      console.log('🔍 테스트 이벤트 "debug_view_test", "analytics_initialized" 전송됨');
      console.log('⚠️  DebugView가 보이지 않으면 Xcode Scheme에 -FIRAnalyticsDebugEnabled 런타임 인자를 추가하세요');
    }
  } catch (error) {
    console.error('❌ Analytics enableDebugMode error:', error);
  }
}

