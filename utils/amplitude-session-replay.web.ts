/**
 * EAS Update / `expo export` 웹 번들에서
 * `@amplitude/plugin-session-replay-react-native`가 로드되면
 * `requireNativeComponent`가 없어 export가 실패합니다.
 * 웹에서는 init 경로가 네이티브가 아니라 사용되지 않습니다.
 */
export class SessionReplayPlugin {
  constructor(..._args: unknown[]) {}
}
