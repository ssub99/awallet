import type { ConfigContext, ExpoConfig } from 'expo/config';

const META_APP_ID = '3000788043449897';

/**
 * EAS Update 채널. `eas.json`의 build 프로필과 맞춤.
 * - EAS Build 시 `EAS_BUILD_PROFILE`이 설정되므로 stage / stage-testflight → `stage`, 그 외 → `production`.
 * - 로컬 `expo prebuild`만 할 때는 프로필이 없으므로 기본 `production` (스토어용 바이너리와 동일 기본값).
 * - 스테이지용 네이티브 빌드를 로컬에서 만들 때: `EAS_BUILD_PROFILE=stage npx expo prebuild`
 */
function resolveExpoUpdatesChannel(): 'stage' | 'production' {
  const profile = process.env.EAS_BUILD_PROFILE ?? '';
  if (profile === 'stage' || profile === 'stage-testflight') {
    return 'stage';
  }
  return 'production';
}

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

export default ({ config }: ConfigContext): ExpoConfig => {
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

  const plugins = (config.plugins ?? []).map((entry) =>
    entry === 'react-native-fbsdk-next' ? facebookPlugin : entry,
  );

  return {
    ...config,
    plugins,
    updates: {
      ...(config.updates ?? {}),
      // expo-updates: runtime supports `channel`; ExpoConfig `updates` type omits it in this SDK line.
      // @ts-expect-error — channel for EAS Update (see resolveExpoUpdatesChannel)
      channel: resolveExpoUpdatesChannel(),
    },
  };
};
