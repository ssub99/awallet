import type { ConfigContext, ExpoConfig } from 'expo/config';

type UpdatesWithChannel = NonNullable<ExpoConfig['updates']> & {
  channel: 'stage' | 'production';
};

const META_APP_ID = '3000788043449897';

/**
 * EAS Update 채널. `eas.json`의 build 프로필과 맞춤.
 * - EAS Build 시 `EAS_BUILD_PROFILE`이 설정되므로 stage / stage-testflight → `stage`, 그 외 → `production`.
 * - 로컬 `expo prebuild`만 할 때는 프로필이 없으므로 기본 `production` (스토어용 바이너리와 동일 기본값).
 * - 스테이지용 네이티브 빌드를 로컬에서 만들 때: `EAS_BUILD_PROFILE=stage npx expo prebuild`
 */
function isStageEasProfile(): boolean {
  const profile = process.env.EAS_BUILD_PROFILE ?? '';
  return profile === 'stage' || profile === 'stage-testflight';
}

function resolveExpoUpdatesChannel(): 'stage' | 'production' {
  if (isStageEasProfile()) {
    return 'stage';
  }
  return 'production';
}

const ANDROID_PACKAGE_PRODUCTION = 'com.ssong.awallet';
const ANDROID_PACKAGE_STAGE = 'com.ssong.awallet.stage';

const SPLASH_IMAGE = './assets/images/splash-icon.png';
/** Android 12+ 스플래시 아이콘 표시 너비(dp). 기본 96은 로고가 작게 보임. iOS는 96 유지. */
const SPLASH_IMAGE_WIDTH_ANDROID = 160;
const SPLASH_IMAGE_WIDTH_IOS = 96;

const splashScreenPlugin: NonNullable<ExpoConfig['plugins']>[number] = [
  'expo-splash-screen',
  {
    ios: {
      image: SPLASH_IMAGE,
      imageWidth: SPLASH_IMAGE_WIDTH_IOS,
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
      dark: { backgroundColor: '#ffffff' },
    },
    android: {
      image: SPLASH_IMAGE,
      imageWidth: SPLASH_IMAGE_WIDTH_ANDROID,
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
      dark: { backgroundColor: '#ffffff' },
    },
  },
];

/** Xcode Archive 등에서 Expo가 `.env.production.local`을 읽지 않을 때 사용. `Info.plist`의 FacebookClientToken과 동일해야 함. */
const FACEBOOK_CLIENT_TOKEN_DEFAULT = 'da66e7f52a5abced5b1f09aeae6c80e6';

function getFacebookClientToken(): string {
  const fromEnv = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (FACEBOOK_CLIENT_TOKEN_DEFAULT.length > 0) {
    return FACEBOOK_CLIENT_TOKEN_DEFAULT;
  }
  throw new Error(
    '[Facebook SDK] EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN 또는 app.config.ts 기본값을 설정하세요. ' +
      'Meta 개발자 > 앱 > 앱 설정 > 고급에서 Client Token을 복사합니다.',
  );
}

export default ({ config }: ConfigContext) => {
  const clientToken = getFacebookClientToken();

  const facebookPlugin: NonNullable<ExpoConfig['plugins']>[number] = [
    'react-native-fbsdk-next',
    {
      appID: META_APP_ID,
      clientToken,
      displayName: '에이월렛',
      scheme: `fb${META_APP_ID}`,
      isAutoInitEnabled: true,
      autoLogAppEventsEnabled: true,
      advertiserIDCollectionEnabled: true,
      iosUserTrackingPermission:
        '맞춤 광고 성과 측정에 활용하기 위해 추적 권한이 필요합니다. 거부해도 서비스는 이용할 수 있습니다.',
    },
  ];

  const plugins = (config.plugins ?? []).map((entry) => {
    if (entry === 'react-native-fbsdk-next') {
      return facebookPlugin;
    }
    if (Array.isArray(entry) && entry[0] === 'expo-splash-screen') {
      return splashScreenPlugin;
    }
    return entry;
  });

  const updates = {
    ...(config.updates ?? {}),
    channel: resolveExpoUpdatesChannel(),
  } satisfies UpdatesWithChannel;

  const stageAndroid = isStageEasProfile();
  const android = config.android
    ? {
        ...config.android,
        package: stageAndroid ? ANDROID_PACKAGE_STAGE : ANDROID_PACKAGE_PRODUCTION,
      }
    : config.android;

  return {
    ...config,
    plugins,
    updates,
    android,
  };
};
