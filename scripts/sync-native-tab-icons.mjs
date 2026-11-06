/**
 * Writes tab icons into existing ios/ + android/ trees (no full prebuild).
 * Usage: node scripts/sync-native-tab-icons.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  writeIosTabIcons,
  writeAndroidTabIcons,
  defaultTabIconSources,
} = require('../plugins/native-tab-icons-lib.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const sources = defaultTabIconSources();

const ios = writeIosTabIcons(projectRoot, path.join(projectRoot, 'ios'), sources);
const android = writeAndroidTabIcons(projectRoot, path.join(projectRoot, 'android'), sources);

console.log(`iOS imagesets: ${ios.count} → ${ios.xcassetsDir}`);
console.log(`Android drawables: ${android.count} → ${android.drawableDir}`);
