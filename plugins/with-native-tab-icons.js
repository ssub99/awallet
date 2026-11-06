/**
 * Expo config plugin: SVG tab icons → iOS xcasset + Android vector drawable.
 *
 * @param {import('expo/config-plugins').ExpoConfig} config
 * @param {{ icons?: { assetName: string, svgPath: string }[] } | undefined} props
 */
const {
  withDangerousMod,
  createRunOncePlugin,
} = require('expo/config-plugins');
const {
  writeIosTabIcons,
  writeAndroidTabIcons,
  defaultTabIconSources,
} = require('./native-tab-icons-lib');

const PACKAGE_NAME = 'with-native-tab-icons';
const PACKAGE_VERSION = '1.0.0';

function withNativeTabIcons(config, props = {}) {
  const sources = props.icons?.length ? props.icons : defaultTabIconSources();

  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const result = writeIosTabIcons(projectRoot, iosRoot, sources);
      console.log(
        `[${PACKAGE_NAME}] iOS: wrote ${result.count} imagesets → ${result.xcassetsDir}`,
      );
      return cfg;
    },
  ]);

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const result = writeAndroidTabIcons(projectRoot, androidRoot, sources);
      console.log(
        `[${PACKAGE_NAME}] Android: wrote ${result.count} drawables → ${result.drawableDir}`,
      );
      return cfg;
    },
  ]);

  return config;
}

module.exports = createRunOncePlugin(withNativeTabIcons, PACKAGE_NAME, PACKAGE_VERSION);
