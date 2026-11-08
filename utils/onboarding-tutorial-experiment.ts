import {
  getExperimentVariantValue,
  isExperimentInitialized,
  refreshExperimentVariants,
  trackExperimentExposure,
} from '@/utils/analytics';

export const ONBOARDING_TUTORIAL_FLAG_KEY =
  process.env.EXPO_PUBLIC_AB_ONBOARDING_TUTORIAL_FLAG_KEY?.trim() ||
  'onboarding_tutorial';

const DEFAULT_TIMEOUT_MS = 1500;

type DecisionSource = 'variant' | 'fallback';
type DecisionGroup = 'control' | 'treatment';

export interface OnboardingTutorialExperimentDecision {
  group: DecisionGroup;
  source: DecisionSource;
  shouldEnableExperience: boolean;
  variantValue: string | null;
}

let cachedDecision: OnboardingTutorialExperimentDecision | null = null;
let exposureTracked = false;

function normalizeGroup(variantValue: string | null): DecisionGroup | null {
  if (variantValue == null) return null;
  const normalized = variantValue.trim().toLowerCase();
  if (
    normalized === 'treatment' ||
    normalized === 'variant' ||
    normalized === 'b' ||
    normalized === 'on' ||
    normalized === 'true'
  ) {
    return 'treatment';
  }
  if (
    normalized === 'control' ||
    normalized === 'a' ||
    normalized === 'off' ||
    normalized === 'false'
  ) {
    return 'control';
  }
  return null;
}

async function refreshWithTimeout(timeoutMs: number): Promise<void> {
  await Promise.race([
    refreshExperimentVariants(undefined, [ONBOARDING_TUTORIAL_FLAG_KEY]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function fallbackDecision(variantValue: string | null): OnboardingTutorialExperimentDecision {
  return {
    group: 'control',
    source: 'fallback',
    shouldEnableExperience: false,
    variantValue,
  };
}

export async function resolveOnboardingTutorialExperimentDecision(
  options?: { forceRefresh?: boolean; timeoutMs?: number },
): Promise<OnboardingTutorialExperimentDecision> {
  if (!options?.forceRefresh && cachedDecision != null) {
    return cachedDecision;
  }

  if (!isExperimentInitialized()) {
    const decision = fallbackDecision(null);
    cachedDecision = decision;
    return decision;
  }

  try {
    if (options?.forceRefresh) {
      await refreshWithTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }
  } catch {
    const variantValue = getExperimentVariantValue(ONBOARDING_TUTORIAL_FLAG_KEY);
    const decision = fallbackDecision(variantValue);
    cachedDecision = decision;
    return decision;
  }

  const variantValue = getExperimentVariantValue(ONBOARDING_TUTORIAL_FLAG_KEY);
  const group = normalizeGroup(variantValue);
  if (group == null) {
    if (variantValue != null) {
      console.warn(
        `[Experiment] 예상하지 못한 variant value(${ONBOARDING_TUTORIAL_FLAG_KEY}=${variantValue}) — control fallback 적용`,
      );
    }
    const decision = fallbackDecision(variantValue);
    cachedDecision = decision;
    return decision;
  }

  const decision: OnboardingTutorialExperimentDecision = {
    group,
    source: 'variant',
    shouldEnableExperience: group === 'treatment',
    variantValue,
  };
  cachedDecision = decision;
  return decision;
}

export function trackOnboardingTutorialExposureOnce(
  decision: OnboardingTutorialExperimentDecision,
): void {
  if (exposureTracked) return;
  if (decision.source !== 'variant') return;
  trackExperimentExposure(ONBOARDING_TUTORIAL_FLAG_KEY);
  exposureTracked = true;
}
