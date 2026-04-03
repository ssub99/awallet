import type { ConfigContext, ExpoConfig } from 'expo/config';

const META_APP_ID = '3000788043449897';

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
  };
};
