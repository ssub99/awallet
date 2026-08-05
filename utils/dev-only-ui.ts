import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

const PRODUCTION_IOS_BUNDLE_ID = 'com.ssong.awallet';
const PRODUCTION_ANDROID_APPLICATION_ID = 'com.ssong.awallet';

/** EAS/네이티브 stage 앱 (TestFlight stage·로컬 awallet-stage 포함) */
export function isStageAppRuntime(): boolean {
  return (
    Updates.channel === 'stage' ||
    Application.applicationId?.includes('.stage') === true
  );
}

/** 스토어 production 앱 (TestFlight prod·App Store·로컬 awallet-production 포함) */
export function isProductionAppRuntime(): boolean {
  if (isStageAppRuntime()) {
    return false;
  }

  if (Updates.channel === 'production') {
    return true;
  }

  const appId = Application.applicationId;
  return (
    appId === PRODUCTION_IOS_BUNDLE_ID ||
    appId === PRODUCTION_ANDROID_APPLICATION_ID
  );
}

/**
 * Metro 로컬 dev 전용 UI — 공지 작성·테스트 환경 바로가기 등.
 * stage·production 앱 바이너리(debug/release)에서는 false.
 */
export function isLocalDevOnlyUIEnabled(): boolean {
  if (!__DEV__) {
    return false;
  }
  if (Constants.appOwnership === 'expo') {
    return true;
  }
  return !isStageAppRuntime() && !isProductionAppRuntime();
}
