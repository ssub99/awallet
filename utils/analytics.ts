import type { BeforePlugin, Event } from '@amplitude/analytics-core';
import {
    Identify,
    add,
    setUserId as amplitudeSetUserId,
    identify,
    init,
    setOptOut,
    track,
} from '@amplitude/analytics-react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { SessionReplayPlugin } from './amplitude-session-replay';

const isNativeMobile = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * @amplitude/analytics-react-native 의 Context 플러그인은
 * `NativeModules.AmplitudeReactNative`가 없을 때(Expo Go 등) platform 을 "Web" 으로 둠.
 * before 체인에서 Context 다음에 등록되어 OS 를 덮어씀.
 */
const amplitudeNativePlatformPlugin: BeforePlugin = {
  name: 'awallet-native-platform-override',
  type: 'before',
  async execute(context: Event): Promise<Event> {
    if (Platform.OS === 'ios') {
      return { ...context, platform: 'iOS' };
    }
    if (Platform.OS === 'android') {
      return { ...context, platform: 'Android' };
    }
    return context;
  },
};

let amplitudeReady = false;

function isProductionRuntime(): boolean {
  // Expo Go와 개발 모드에서는 무조건 DEBUG 키 사용
  if (__DEV__ || Constants.appOwnership === 'expo') {
    return false;
  }
  // stage 등 production이 아닌 업데이트 채널은 DEBUG
  if (Updates.channel !== 'production') {
    return false;
  }
  // App Store 설치는 storeClient. TestFlight·스토어 제출 전 EAS 빌드 등은 standalone/bare로 잡히는 경우가 많아,
  // storeClient만 요구하면 PROD 키 분기에 못 들어가 디버그 프로젝트로만 전송됨.
  const env = Constants.executionEnvironment;
  return env === 'storeClient' || env === 'standalone' || env === 'bare';
}

function resolveAmplitudeApiKey(): string | null {
  const prodKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY_PROD?.trim();
  const debugKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY_DEBUG?.trim();
  const legacyKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY?.trim();

  // 스토어·production 채널: PROD 우선, 없으면 legacy(1.1.0과 동일·기존 스토어 빌드 호환)
  if (isProductionRuntime()) {
    return prodKey || legacyKey || null;
  }
  return debugKey || legacyKey || null;
}

/**
 * Amplitude + Session Replay 초기화. 앱당 1회 `app/_layout.tsx`에서 호출합니다.
 * 환경별 API 키가 없으면 전송은 생략됩니다.
 */
export async function initAmplitude(): Promise<void> {
  if (!isNativeMobile || amplitudeReady) return;

  const apiKey = resolveAmplitudeApiKey();
  if (!apiKey) {
    if (__DEV__) {
      console.warn('[Analytics] 환경에 맞는 Amplitude API 키 없음 — 전송 생략');
    }
    return;
  }

  if (__DEV__) {
    const target = isProductionRuntime() ? 'prod' : 'debug';
    const masked = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
    console.log(
      `[Analytics] key target=${target}, appOwnership=${String(Constants.appOwnership)}, executionEnvironment=${String(Constants.executionEnvironment)}, channel=${String(Updates.channel)}, key=${masked}`,
    );
  }

  try {
    await init(apiKey, undefined, {
      trackingOptions: {
        platform: true,
        osName: true,
        osVersion: true,
        deviceModel: true,
      },
    }).promise;
  } catch (error) {
    console.warn('[Analytics] Amplitude init 실패:', error);
    return;
  }

  try {
    await add(amplitudeNativePlatformPlugin).promise;
  } catch (error) {
    console.warn('[Analytics] platform 보정 플러그인 등록 실패:', error);
  }

  // Session Replay는 네이티브 링크 필요. Expo Go·링크 누락 시에도 이벤트(track)는 쓰도록 분리.
  try {
    await add(new SessionReplayPlugin()).promise;
    if (__DEV__) {
      console.log('[Analytics] Session Replay 등록 완료');
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[Analytics] Session Replay 생략(Expo Go이거나 `pod install` 후 네이티브 미재빌드). 이벤트만 전송합니다.',
        error,
      );
    }
  }

  amplitudeReady = true;
  if (__DEV__) {
    console.log('[Analytics] Amplitude 이벤트 전송 준비 완료');
  }
}

function assertReady(): boolean {
  if (!isNativeMobile) {
    if (__DEV__) {
      console.log('[Analytics] (web 등 네이티브 외) 전송 생략');
    }
    return false;
  }
  if (!amplitudeReady) {
    if (__DEV__) {
      console.log('[Analytics] Amplitude 미초기화 — 이벤트 생략');
    }
    return false;
  }
  return true;
}

/**
 * 커스텀 이벤트 전송 (앱 어디서든 `@/utils/analytics`의 `logEvent` 호출)
 */
export async function logEvent(
  eventName: string,
  params?: Record<string, unknown>,
): Promise<void> {
  if (!assertReady()) return;

  try {
    const payload: Record<string, unknown> = {
      app_runtime: Platform.OS,
      ...(params ?? {}),
    };
    track(eventName, payload);
  } catch (error) {
    console.warn(`[Analytics] logEvent 실패: ${eventName}`, error);
  }
}

export type RecordLifecycleEntity = 'income' | 'expense';

/** 소비: 일반 / 정기 / 할부. 반복·할부 저장 1회당 1건. */
export type ExpenseCreationVariant =
  | 'general'
  | 'repeated_isrecurring'
  | 'repeated_isinstallment';

/** 챌린지: 일반 vs 반복 — `challenge_variant` 속성 */
export type ChallengeCreationVariant = 'general' | 'isrecurring';

/** 소비 분석: 반복 종류 (할부 > 정기 > 일반) */
export type ExpenseRepeatKind = 'none' | 'recurring' | 'installment';

export type ExpenseWeekendOptionAnalytics = 'friday' | 'monday' | 'weekend' | 'none';

export type ExpenseSettlementKind = 'none' | 'prepayment' | 'refund' | 'settlement';
export type ExpensePeriodUnit =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | '2weeks'
  | '3weeks'
  | '4weeks'
  | '2months'
  | '4months'
  | '6months'
  | 'weekdays'
  | 'weekends';

/** 정기/할부 환불 범위(UI 옵션과 대응). 미해당 시 null */
export type ExpenseRefundScopeAnalytics = 'all' | 'from_today' | 'future_only';

/** 정산 처리(선결제·환불·결산) 적용/복구 1회 = 이벤트 1회 */
export type ExpenseAdjustmentState = 'applied' | 'restored';

/** `adjustment` 이벤트 프로퍼티 값: 어떤 줄(선결제·환불·결산)에 대한 이벤트인지 */
export type ExpenseAdjustmentKind = 'isprepaid' | 'isrefunded' | 'issettled';

export interface ExpenseLifecycleAnalyticsPayload {
  repeat_kind: ExpenseRepeatKind;
  period_months: number | null;
  weekend_option: ExpenseWeekendOptionAnalytics;
  settlement_kind: ExpenseSettlementKind;
  refund_scope: ExpenseRefundScopeAnalytics | null;
  /**
   * 해당 기록의 현재 정산 종류.
   * 환불 > 결산 > 선결제 우선순위로 하나만 결정. 셋 다 아니면 null.
   */
  adjustment: ExpenseAdjustmentKind | null;
  /** `adjustment != null` 이면 현재 적용 상태 `'applied'`, 그 외엔 null */
  state: ExpenseAdjustmentState | null;
}

/**
 * `simple_creation` 값.
 * - `true`: 간편입력(또는 원본이 간편입력)
 * - `false`: 생성 화면 경로
 * - `'unknown'`: 출처 추적 필드가 없는 레거시 레코드의 삭제 이벤트 등
 */
export type ExpenseSimpleCreationValue = boolean | 'unknown';

export interface ExpenseCreationCompletionPayload {
  repeat_count: number;
  period_unit?: ExpensePeriodUnit;
  /**
   * 간편입력 경로로 "생성된" 기록이면 true.
   * - 생성 이벤트: 이번 경로가 간편입력이면 true, 생성 화면이면 false
   * - 삭제 이벤트: 원본 기록이 간편입력이면 true, 생성 화면이면 false,
   *               출처 추적이 없는 레거시 레코드면 'unknown'
   */
  simple_creation: ExpenseSimpleCreationValue;
  /** 메모 입력 여부 */
  memo: boolean;
}

export interface ChallengeLifecycleAnalyticsPayload {
  /** 챌린지 ID (ULID 문자열) */
  challenge_id: string;
  is_recurring: boolean;
  duration_months: number | null;
  /** 챌린지 시작일 (yyyy.mm.dd hh:mm:ss) */
  start_date: string;
  /** 챌린지 생성 시각 (yyyy.mm.dd hh:mm:ss) */
  created_at: string;
  /** 챌린지 종료일 (yyyy.mm.dd hh:mm:ss) */
  end_date: string;
}

/** 챌린지 생성·삭제 완료 집계용(`created_challenge_complete` / `deleted_challenge_complete`). `challenge_id` 없음. */
export interface ChallengeCreatedCompleteAnalyticsPayload {
  challenge_variant: ChallengeCreationVariant;
  is_recurring: boolean;
  duration_months: number | null;
}

/** 챌린지 기간 종료 후 판정 결과 (`challenge_result.result`) */
export type ChallengeResultOutcome = 'success' | 'fail';

/** 종료 후 판정 시점(`challenge_result`). 타임스탬프는 `yyyy.mm.dd hh:mm:ss`. */
export interface ChallengeResultAnalyticsPayload {
  challenge_id: string;
  challenge_variant: ChallengeCreationVariant;
  is_recurring: boolean;
  duration_months: number | null;
  start_date: string;
  created_at: string;
  judged_at: string;
  end_date: string;
  result: ChallengeResultOutcome;
}

export interface ExpenseAdjustmentAnalyticsPayload {
  /** 키 `adjustment`에 대응: `isprepaid` | `isrefunded` | `issettled` 중 하나 */
  adjustment: ExpenseAdjustmentKind;
  state: ExpenseAdjustmentState;
  /** 환불 처리·복구일 때만. 그 외 `null` */
  refund_scope: ExpenseRefundScopeAnalytics | null;
  /** `record_created`의 `expense_variant`와 동일 규칙 (일반 / 정기 / 할부) */
  expense_variant: ExpenseCreationVariant;
}

/**
 * 정산 처리 / 복구 완료. `adjustment`는 세 종류 중 하나, `refund_scope`는 환불일 때만.
 */
export function logExpenseAdjustment(payload: ExpenseAdjustmentAnalyticsPayload): void {
  void logEvent('expense_adjustment', {
    record_type: 'expense',
    adjustment: payload.adjustment,
    state: payload.state,
    refund_scope: payload.refund_scope,
    expense_variant: payload.expense_variant,
  });
}

/**
 * 환불 옵션 모달 값 → 분석용 `refund_scope` (B: UI 확정 시점에서만 설정)
 */
export function mapRefundOptionToAnalytics(
  option: 'all' | 'today' | 'future',
): ExpenseRefundScopeAnalytics {
  if (option === 'today') {
    return 'from_today';
  }
  if (option === 'future') {
    return 'future_only';
  }
  return 'all';
}

/**
 * 로컬 기록 생성·삭제 성공(행위 1회 = 이벤트 1회). Amplitude에서는 이벤트 수로 집계합니다.
 */
export function logRecordLifecycleCount(
  action: 'create' | 'delete',
  entity: RecordLifecycleEntity,
  extra?: { memo?: boolean },
): void {
  const eventName = action === 'create' ? 'record_created' : 'record_deleted';
  const completeEventName = action === 'create' ? 'created_complete' : 'deleted_complete';
  const payload: Record<string, unknown> = {
    record_type: entity,
  };
  if (typeof extra?.memo === 'boolean') {
    payload.memo = extra.memo;
  }
  void logEvent(eventName, payload);
  // created_complete/deleted_complete: record_type + memo (income은 expense_variant 등 불필요)
  const completePayload: Record<string, unknown> = { record_type: entity, repeat_count: 1 };
  if (typeof extra?.memo === 'boolean') {
    completePayload.memo = extra.memo;
  }
  void logEvent(completeEventName, completePayload);
}

/**
 * 소비 기록 생성. `expense_variant`: general | repeated_isrecurring | repeated_isinstallment
 */
export function logExpenseCreate(
  variant: ExpenseCreationVariant,
  payload: ExpenseLifecycleAnalyticsPayload,
  completion: ExpenseCreationCompletionPayload,
): void {
  const merged: Record<string, unknown> = {
    record_type: 'expense',
    expense_variant: variant,
    ...payload,
    ...completion,
  };

  // Amplitude: 정기는 `period_unit`만 사용, `period_months`는 생애주기 숫자 대신 none
  // 일반은 `period_unit`·`period_months` 모두 none (할부는 기존 숫자 `period_months` 유지)
  if (variant === 'general') {
    merged.repeat_count = 'none';
    merged.period_unit = 'none';
    merged.period_months = 'none';
  } else if (variant === 'repeated_isrecurring') {
    merged.period_months = 'none';
  }

  void logEvent('record_created', merged);
}

/**
 * 소비 기록 생성 완료 (사용자 액션 1회 = 1이벤트).
 * 수집 속성: record_type, expense_variant, repeat_kind, period_months, period_unit
 */
export function logExpenseCreateComplete(
  variant: ExpenseCreationVariant,
  payload: ExpenseLifecycleAnalyticsPayload,
  completion: ExpenseCreationCompletionPayload,
): void {
  let period_months: number | string | null = payload.period_months;
  let period_unit: ExpensePeriodUnit | undefined = completion.period_unit;
  let repeat_count: number | 'none' = completion.repeat_count;

  if (variant === 'general') {
    period_unit = 'none';
    period_months = 'none';
    repeat_count = 'none';
  } else if (variant === 'repeated_isrecurring') {
    period_months = 'none';
  }

  void logEvent('created_complete', {
    record_type: 'expense',
    expense_variant: variant,
    repeat_count,
    repeat_kind: payload.repeat_kind,
    period_months,
    period_unit,
    simple_creation: completion.simple_creation,
    memo: completion.memo,
  });
}

/**
 * 챌린지 생성 완료.
 * 속성: challenge_id, challenge_variant, is_recurring, duration_months, start_date, created_at, end_date
 */
export function logChallengeCreated(
  variant: ChallengeCreationVariant,
  payload: ChallengeLifecycleAnalyticsPayload,
): void {
  void logEvent('challenge_created', {
    challenge_id: payload.challenge_id,
    challenge_variant: variant,
    is_recurring: payload.is_recurring,
    duration_months: payload.duration_months,
    start_date: payload.start_date,
    created_at: payload.created_at,
    end_date: payload.end_date,
  });
}

/**
 * 챌린지 생성 완료 (사용자 액션 1회 = 1이벤트). `challenge_created`가 월·건수만큼 N번일 때 집계용.
 * 속성: challenge_variant, is_recurring, duration_months (`challenge_id` 미포함).
 */
export function logChallengeCreatedComplete(
  payload: ChallengeCreatedCompleteAnalyticsPayload,
): void {
  void logEvent('created_challenge_complete', {
    challenge_variant: payload.challenge_variant,
    is_recurring: payload.is_recurring,
    duration_months: payload.duration_months,
  });
}

/**
 * 소비 기록 삭제. 생성 시와 동일한 `expense_variant` 및 생애주기/완료 속성을 실어 보낸다.
 */
export function logExpenseDelete(
  variant: ExpenseCreationVariant,
  payload: ExpenseLifecycleAnalyticsPayload,
  completion: ExpenseCreationCompletionPayload,
): void {
  const merged: Record<string, unknown> = {
    record_type: 'expense',
    expense_variant: variant,
    ...payload,
    ...completion,
  };

  // 생성 이벤트와 동일 스키마: 정기는 `period_months` none, 일반은 `period_unit`·`period_months` 모두 none
  if (variant === 'general') {
    merged.repeat_count = 'none';
    merged.period_unit = 'none';
    merged.period_months = 'none';
  } else if (variant === 'repeated_isrecurring') {
    merged.period_months = 'none';
  }

  void logEvent('record_deleted', merged);
}

/**
 * 소비 기록 삭제 완료 (사용자 액션 1회 = 1이벤트). 속성은 `record_deleted`와 완전히 동일.
 */
/**
 * 소비 기록 삭제 완료 (사용자 액션 1회 = 1이벤트).
 * 수집 속성: record_type, expense_variant, repeat_kind, period_months, period_unit
 */
export function logExpenseDeleteComplete(
  variant: ExpenseCreationVariant,
  payload: ExpenseLifecycleAnalyticsPayload,
  completion: ExpenseCreationCompletionPayload,
): void {
  let period_months: number | string | null = payload.period_months;
  let period_unit: ExpensePeriodUnit | undefined = completion.period_unit;
  let repeat_count: number | 'none' = completion.repeat_count;

  if (variant === 'general') {
    period_unit = 'none';
    period_months = 'none';
    repeat_count = 'none';
  } else if (variant === 'repeated_isrecurring') {
    period_months = 'none';
  }

  void logEvent('deleted_complete', {
    record_type: 'expense',
    expense_variant: variant,
    repeat_count,
    repeat_kind: payload.repeat_kind,
    period_months,
    period_unit,
    simple_creation: completion.simple_creation,
    memo: completion.memo,
  });
}

/**
 * 챌린지 삭제 완료.
 * 속성: challenge_id, challenge_variant, is_recurring, duration_months, start_date, created_at, end_date
 */
export function logChallengeDeleted(
  variant: ChallengeCreationVariant,
  payload: ChallengeLifecycleAnalyticsPayload,
): void {
  void logEvent('challenge_deleted', {
    challenge_id: payload.challenge_id,
    challenge_variant: variant,
    is_recurring: payload.is_recurring,
    duration_months: payload.duration_months,
    start_date: payload.start_date,
    created_at: payload.created_at,
    end_date: payload.end_date,
  });
}

/**
 * 챌린지 삭제 완료 (사용자 액션·그룹 1회 = 1이벤트). `challenge_deleted`가 N번일 때 집계용.
 * 속성은 `created_challenge_complete`와 동일 (`challenge_id` 미포함).
 */
export function logChallengeDeletedComplete(
  payload: ChallengeCreatedCompleteAnalyticsPayload,
): void {
  void logEvent('deleted_challenge_complete', {
    challenge_variant: payload.challenge_variant,
    is_recurring: payload.is_recurring,
    duration_months: payload.duration_months,
  });
}

export function logChallengeResult(payload: ChallengeResultAnalyticsPayload): void {
  void logEvent('challenge_result', {
    challenge_id: payload.challenge_id,
    challenge_variant: payload.challenge_variant,
    is_recurring: payload.is_recurring,
    duration_months: payload.duration_months,
    start_date: payload.start_date,
    created_at: payload.created_at,
    judged_at: payload.judged_at,
    end_date: payload.end_date,
    result: payload.result,
  });
}

/**
 * Amplitude 수집 on/off (`setOptOut`에 매핑)
 */
export async function setAnalyticsCollectionEnabled(enabled: boolean): Promise<void> {
  if (!isNativeMobile || !amplitudeReady) {
    if (__DEV__) {
      console.log(`[Analytics] setAnalyticsCollectionEnabled 생략: ${enabled}`);
    }
    return;
  }
  try {
    setOptOut(!enabled);
  } catch (error) {
    console.warn('[Analytics] setOptOut 실패:', error);
  }
}

/**
 * 사용자 속성 (Identify)
 */
export async function setUserProperty(name: string, value: string | null): Promise<void> {
  if (!assertReady()) return;

  try {
    const id = new Identify();
    if (value === null) {
      id.unset(name);
    } else {
      id.set(name, value);
    }
    await identify(id).promise;
  } catch (error) {
    console.warn(`[Analytics] setUserProperty 실패: ${name}`, error);
  }
}

export async function setUserId(userId: string | null): Promise<void> {
  if (!assertReady()) return;

  try {
    amplitudeSetUserId(userId ?? undefined);
  } catch (error) {
    console.warn('[Analytics] setUserId 실패:', error);
  }
}

/**
 * 화면 조회 (전역 라우트 리스너에서도 사용)
 */
export async function logScreenView(
  screenName: string,
  screenClass?: string,
  params?: Record<string, unknown>,
): Promise<void> {
  if (!assertReady()) return;

  try {
    track('screen_view', {
      app_runtime: Platform.OS,
      screen_name: screenName,
      screen_class: screenClass ?? screenName,
      ...(params ?? {}),
    });
  } catch (error) {
    console.warn(`[Analytics] logScreenView 실패: ${screenName}`, error);
  }
}

/**
 * Firebase DebugView 대응 구간. Amplitude는 대시보드에서 실시간 확인.
 */
export async function enableDebugMode(): Promise<void> {
  if (__DEV__) {
    console.log('[Analytics] Amplitude는 콘솔/대시보드 Live view로 확인하세요.');
  }
}
