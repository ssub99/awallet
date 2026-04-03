import type { ConfigContext, ExpoConfig } from 'expo/config';

const META_APP_ID = '3000788043449897';

function getFacebookClientToken(): string {
  const token = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN?.trim();
  if (token) {
    return token;
  }
  throw new Error(
    '[Facebook SDK] .env에 EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN을 설정하세요. ' +
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
        '맞춤 광고 성과 측정에 활용하기 위해 추적 권한이 필요합니다. 거부해도 앱은 이용할 수 있습니다.',
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
