/**
 * Android 스플래시 drawable만 재생성합니다.
 * `npx expo prebuild -p android` 는 Image Asset으로 만든 mipmap 을 덮어쓸 수 있으므로 사용하지 않습니다.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '@expo/config';
import { setSplashImageDrawablesAsync } from '@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen/withAndroidSplashImages.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getAndroidSplashPluginProps(exp) {
  const plugins = exp.plugins ?? [];
  for (const entry of plugins) {
    if (!Array.isArray(entry) || entry[0] !== 'expo-splash-screen') {
      continue;
    }
    const props = entry[1];
    if (props?.android) {
      return props.android;
    }
    return props;
  }
  throw new Error('expo-splash-screen plugin not found in app config');
}

const { exp } = getConfig(projectRoot);
const androidSplash = getAndroidSplashPluginProps(exp);
const imageWidth = androidSplash.imageWidth ?? 100;

await setSplashImageDrawablesAsync(exp, androidSplash, projectRoot, imageWidth);
console.log(`Android splash drawables regenerated (imageWidth=${imageWidth}dp).`);
