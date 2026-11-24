import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getExperimentVariantValue,
  isExperimentInitialized,
  refreshExperimentVariants,
  trackExperimentExposure,
} from '@/utils/analytics';

/**
 * 홈 리스트뷰 A/B 테스트 (Amplitude Experiment 플래그).
 *
 * 목적: 간편 생성을 더 확보하려고 만든 홈 리스트뷰가 실제로 간편 생성을 늘리는지 본다.
 * 성공 지표는 `entry_screen`을 붙인 created_complete.
 *
 * - treatment : 리스트뷰가 있고, 리스트뷰로 시작한다. 이후에는 사용자가 바꾼 뷰를 기억한다.
 * - control   : 리스트뷰가 없다 (캘린더뷰만, 전환 아이콘 없음).
 * - excluded  : 변형을 받지 못한 사용자. control과 같은 화면(캘린더뷰만)을 보고, 노출을 기록하지 않아 결과에서 빠진다.
 *
 * 한 번 정해진 결과는 기기에 저장해 다시 조회하지 않는다. 한 기기가 한 가지 경험만 하게 하기 위함이다
 * (규칙: .cursor/rules/20-ab-test.mdc). 플래그를 끄면 새로 조회하는 기기는 excluded가 되어 캘린더뷰로 돌아온다.
 */
export const HOME_VIEW_EXPERIMENT_FLAG_KEY = 'ensure_simple_creation';

const STORAGE_KEY = 'homeViewExperimentGroup';
const DEFAULT_TIMEOUT_MS = 1500;

export type HomeViewExperimentGroup = 'control' | 'treatment' | 'excluded';

let cachedGroup: HomeViewExperimentGroup | null = null;
let pendingResolve: Promise<HomeViewExperimentGroup> | null = null;
let exposureTracked = false;

function normalizeVariant(variantValue: string | null): 'control' | 'treatment' | null {
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

function isStoredGroup(value: string | null): value is HomeViewExperimentGroup {
  return value === 'control' || value === 'treatment' || value === 'excluded';
}

async function refreshWithTimeout(timeoutMs: number): Promise<void> {
  await Promise.race([
    refreshExperimentVariants(undefined, [HOME_VIEW_EXPERIMENT_FLAG_KEY]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function fetchGroup(timeoutMs: number): Promise<HomeViewExperimentGroup> {
  // Experiment가 준비되지 않았으면 변형을 알 수 없다 → 실험 제외
  if (!isExperimentInitialized()) {
    return 'excluded';
  }
  try {
    await refreshWithTimeout(timeoutMs);
  } catch {
    // 조회 실패여도 SDK가 이미 받아 둔 값이 있으면 아래에서 쓴다
  }
  const variantValue = getExperimentVariantValue(HOME_VIEW_EXPERIMENT_FLAG_KEY);
  const group = normalizeVariant(variantValue);
  if (group == null && variantValue != null) {
    console.warn(
      `[Experiment] 예상하지 못한 variant value(${HOME_VIEW_EXPERIMENT_FLAG_KEY}=${variantValue}) — 실험 제외`,
    );
  }
  return group ?? 'excluded';
}

/** 이미 정해진 그룹(메모리). 아직 판정 전이면 null */
export function getResolvedHomeViewExperimentGroup(): HomeViewExperimentGroup | null {
  return cachedGroup;
}

/**
 * 이 기기의 실험 그룹을 돌려준다. 저장된 값이 있으면 그것을 쓰고(조회 없음),
 * 없으면 한 번 조회해 정한 뒤 저장한다. 같은 실행에서 여러 번 불러도 한 번만 판정한다.
 */
export function resolveHomeViewExperiment(options?: {
  timeoutMs?: number;
}): Promise<HomeViewExperimentGroup> {
  if (cachedGroup != null) {
    return Promise.resolve(cachedGroup);
  }
  if (pendingResolve == null) {
    pendingResolve = (async () => {
      let group: HomeViewExperimentGroup;
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isStoredGroup(stored)) {
          group = stored;
        } else {
          group = await fetchGroup(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
          await AsyncStorage.setItem(STORAGE_KEY, group);
        }
      } catch {
        // 저장소를 읽거나 쓰지 못하면 이번 실행만 실험 제외로 보고 저장은 하지 않는다
        group = 'excluded';
      }
      cachedGroup = group;
      return group;
    })().finally(() => {
      pendingResolve = null;
    });
  }
  return pendingResolve;
}

/** 이 그룹에게 리스트뷰가 열려 있는지 (실험군만) */
export function isHomeListViewEnabled(group: HomeViewExperimentGroup | null): boolean {
  return group === 'treatment';
}

/**
 * 노출 기록 — 배정된 뷰가 처음 그려진 뒤 실행당 한 번. control과 treatment 모두 보낸다.
 * excluded는 보내지 않는다. 이번 실행에서 SDK가 같은 variant를 갖고 있을 때만 보낸다
 * (빈 variant 노출은 실험 사용자 속성을 지우므로 보내지 않는다).
 */
export function trackHomeViewExposureOnce(group: HomeViewExperimentGroup | null): void {
  if (exposureTracked) return;
  if (group !== 'control' && group !== 'treatment') return;
  const current = normalizeVariant(getExperimentVariantValue(HOME_VIEW_EXPERIMENT_FLAG_KEY));
  if (current !== group) return;
  trackExperimentExposure(HOME_VIEW_EXPERIMENT_FLAG_KEY);
  exposureTracked = true;
}
