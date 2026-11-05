import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const layoutSrc = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
const navSrc = fs.readFileSync(path.join(root, 'components/root-app-navigation.tsx'), 'utf8');
const screenSrc = fs.readFileSync(
  path.join(root, 'components/onboarding/onboarding-screen.tsx'),
  'utf8',
);
const stepsSrc = fs.readFileSync(path.join(root, 'constants/onboarding-steps.ts'), 'utf8');
const shellSrc = fs.readFileSync(path.join(root, 'components/root-layout-shell.tsx'), 'utf8');
const routesSrc = fs.readFileSync(path.join(root, 'constants/root-stack-routes.ts'), 'utf8');

const checks = {
  gateInLayout: layoutSrc.includes('RootAppNavigation'),
  noOnboardingRoute: !fs.existsSync(path.join(root, 'app/onboarding.tsx')),
  noOnboardingInRoutes: !routesSrc.includes("'onboarding'"),
  prewarmAfterContentFade: screenSrc.includes('onReadyToPrewarmMain'),
  stackPhases: navSrc.includes("'warming'") && navSrc.includes("'fading'"),
  lazyLottieLoad: stepsSrc.includes('getOnboardingMotion') && stepsSrc.includes('lottieCache'),
  appDataGated: shellSrc.includes('appDataEnabled'),
  noRouterHomeNav: !screenSrc.includes("replace('/home')") && !navSrc.includes("push('/home')"),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ checks, ok }, null, 2));
if (!ok) process.exit(1);
