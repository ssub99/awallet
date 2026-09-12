const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

const RN_TEXT = path.resolve(projectRoot, 'node_modules/react-native/Libraries/Text/Text.js');
const RN_TEXT_INPUT = path.resolve(
  projectRoot,
  'node_modules/react-native/Libraries/Components/TextInput/TextInput.js',
);
const PATCH_TEXT = path.resolve(projectRoot, 'patches/react-native-text.tsx');
const PATCH_TEXT_INPUT = path.resolve(projectRoot, 'patches/react-native-text-input.tsx');
const PATCHES_DIR = `${path.sep}patches${path.sep}`;

const config = getDefaultConfig(projectRoot);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  resolveRequest: (context, moduleName, platform) => {
    // Metro는 이 훅 호출 전에 context.resolveRequest를 내장 resolve로 바꿔 둔다.
    // 여길 쓰면 Expo 경로 alias(@/)·exports가 유지되고,
    // 루트/expo 이중 metro-resolver 재귀도 피한다.
    const resolution = context.resolveRequest(context, moduleName, platform);

    if (!resolution?.filePath) {
      return resolution;
    }

    const origin = context.originModulePath ?? '';
    const isFromPatches = origin.includes(PATCHES_DIR);
    const resolvedPath = path.normalize(resolution.filePath);

    if (!isFromPatches) {
      if (resolvedPath === path.normalize(RN_TEXT)) {
        return { ...resolution, filePath: PATCH_TEXT };
      }
      if (resolvedPath === path.normalize(RN_TEXT_INPUT)) {
        return { ...resolution, filePath: PATCH_TEXT_INPUT };
      }
    }

    return resolution;
  },
};

module.exports = config;
