import type { BeforePlugin, Event } from '@amplitude/analytics-core';
import {
    Identify,
    add,
    setUserId as amplitudeSetUserId,
    identify,
    init,
    setOptOut,
    track,
} from '@amplitude/analytics-react-native';
import { SessionReplayPlugin } from './amplitude-session-replay';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

const isNativeMobile = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * @amplitude/analytics-react-native 의 Context 플러그인은
 * `NativeModules.AmplitudeReactNative`가 없을 때(Expo Go 등) platform 을 "Web" 으로 둠.
 * before 체인에서 Context 다음에 등록되어 OS 를 덮어씀.
 */
const amplitudeNativePlatformPlugin: BeforePlugin = {
  name: 'awallet-native-platform-override',
  type: 'before',
  async execute(context: Event): Promise<Event> {
    if (Platform.OS === 'ios') {
      return { ...context, platform: 'iOS' };
    }
    if (Platform.OS === 'android') {
      return { ...context, platform: 'Android' };
    }
    return context;
  },
};

let amplitudeReady = false;

function isProductionRuntime(): boolean {
  // Expo Go와 개발 모드에서는 무조건 DEBUG 키 사용
  if (__DEV__ || Constants.appOwnership === 'expo') {
    return false;
  }
  // Stage(채널 stage)도 DEBUG로 보낸다. 오직 production 채널의 스토어 바이너리만 PROD.
  return (
    Constants.executionEnvironment === 'storeClient' &&
    Updates.channel === 'production'
  );
}

function resolveAmplitudeApiKey(): string | null {
  const prodKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY_PROD?.trim();
  const debugKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY_DEBUG?.trim();
  const legacyKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY?.trim();

  if (isProductionRuntime()) {
    return prodKey || legacyKey || null;
  }
  return debugKey || legacyKey || null;
}

/**
 * Amplitude + Session Replay 초기화. 앱당 1회 `app/_layout.tsx`에서 호출합니다.
 * 환경별 API 키가 없으면 전송은 생략됩니다.
 */
export async function initAmplitude(): Promise<void> {
  if (!isNativeMobile || amplitudeReady) return;

  const apiKey = resolveAmplitudeApiKey();
  if (!apiKey) {
    if (__DEV__) {
      console.warn('[Analytics] 환경에 맞는 Amplitude API 키 없음 — 전송 생략');
    }
    return;
  }

  if (__DEV__) {
    const target = isProductionRuntime() ? 'prod' : 'debug';
    const masked = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
    console.log(
      `[Analytics] key target=${target}, appOwnership=${String(Constants.appOwnership)}, executionEnvironment=${String(Constants.executionEnvironment)}, channel=${String(Updates.channel)}, key=${masked}`,
    );
  }

  try {
    await init(apiKey, undefined, {
      trackingOptions: {
        platform: true,
        osName: true,
        osVersion: true,
        deviceModel: true,
      },
    }).promise;
  } catch (error) {
    console.warn('[Analytics] Amplitude init 실패:', error);
    return;
  }

  try {
    await add(amplitudeNativePlatformPlugin).promise;
  } catch (error) {
    console.warn('[Analytics] platform 보정 플러그인 등록 실패:', error);
  }

  // Session Replay는 네이티브 링크 필요. Expo Go·링크 누락 시에도 이벤트(track)는 쓰도록 분리.
  try {
    await add(new SessionReplayPlugin()).promise;
    if (__DEV__) {
      console.log('[Analytics] Session Replay 등록 완료');
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[Analytics] Session Replay 생략(Expo Go이거나 `pod install` 후 네이티브 미재빌드). 이벤트만 전송합니다.',
        error,
      );
    }
  }

  amplitudeReady = true;
  if (__DEV__) {
    console.log('[Analytics] Amplitude 이벤트 전송 준비 완료');
  }
}

function assertReady(): boolean {
  if (!isNativeMobile) {
    if (__DEV__) {
      console.log('[Analytics] (web 등 네이티브 외) 전송 생략');
    }
    return false;
  }
  if (!amplitudeReady) {
    if (__DEV__) {
      console.log('[Analytics] Amplitude 미초기화 — 이벤트 생략');
    }
    return false;
  }
  return true;
}

/**
 * 커스텀 이벤트 전송 (앱 어디서든 `@/utils/analytics`의 `logEvent` 호출)
 */
export async function logEvent(
  eventName: string,
  params?: Record<string, unknown>,
): Promise<void> {
  if (!assertReady()) return;

  try {
    const payload: Record<string, unknown> = {
      app_runtime: Platform.OS,
      ...(params ?? {}),
    };
    track(eventName, payload);
  } catch (error) {
    console.warn(`[Analytics] logEvent 실패: ${eventName}`, error);
  }
}

/**
 * Amplitude 수집 on/off (`setOptOut`에 매핑)
 */
export async function setAnalyticsCollectionEnabled(enabled: boolean): Promise<void> {
  if (!isNativeMobile || !amplitudeReady) {
    if (__DEV__) {
      console.log(`[Analytics] setAnalyticsCollectionEnabled 생략: ${enabled}`);
    }
    return;
  }
  try {
    setOptOut(!enabled);
  } catch (error) {
    console.warn('[Analytics] setOptOut 실패:', error);
  }
}

/**
 * 사용자 속성 (Identify)
 */
export async function setUserProperty(name: string, value: string | null): Promise<void> {
  if (!assertReady()) return;

  try {
    const id = new Identify();
    if (value === null) {
      id.unset(name);
    } else {
      id.set(name, value);
    }
    await identify(id).promise;
  } catch (error) {
    console.warn(`[Analytics] setUserProperty 실패: ${name}`, error);
  }
}

export async function setUserId(userId: string | null): Promise<void> {
  if (!assertReady()) return;

  try {
    amplitudeSetUserId(userId ?? undefined);
  } catch (error) {
    console.warn('[Analytics] setUserId 실패:', error);
  }
}

/**
 * 화면 조회 (전역 라우트 리스너에서도 사용)
 */
export async function logScreenView(
  screenName: string,
  screenClass?: string,
  params?: Record<string, unknown>,
): Promise<void> {
  if (!assertReady()) return;

  try {
    track('screen_view', {
      app_runtime: Platform.OS,
      screen_name: screenName,
      screen_class: screenClass ?? screenName,
      ...(params ?? {}),
    });
  } catch (error) {
    console.warn(`[Analytics] logScreenView 실패: ${screenName}`, error);
  }
}

/**
 * Firebase DebugView 대응 구간. Amplitude는 대시보드에서 실시간 확인.
 */
export async function enableDebugMode(): Promise<void> {
  if (__DEV__) {
    console.log('[Analytics] Amplitude는 콘솔/대시보드 Live view로 확인하세요.');
  }
}
