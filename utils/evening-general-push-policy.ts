/**
 * 저녁 일반 푸시(소비 기록 유도 · 문자 가기록 생성 유도) 판정.
 * 판정 구간: 전날 20:00:00 ~ 당일 20:00:00
 */

export type EveningPushKind = 'expense_reminder' | 'sms_inbox_reminder' | 'none';

export type EveningPushWindow = {
  startMs: number;
  endMs: number;
};

export type EveningPushInputs = {
  nowMs: number;
  /** 판정 구간 내 소비 기록 생성 여부 */
  hasExpenseCreatedInWindow: boolean;
  /** 판정 구간 내 가기록 수신 건수(무효화 제외) */
  smsReceivedCount: number;
  /** 판정 구간 내 수신 후 소비로 전환되지 않은 가기록 건수 */
  smsUnconvertedCount: number;
};

export type EveningPushDecision = {
  kind: EveningPushKind;
  /** sms_inbox_reminder 일 때 본문 N */
  smsCount: number;
};

/** 발송일 기준 판정 구간 [전날 20:00, 당일 20:00) */
export function getJudgmentWindowEndingAt(endMs: number): EveningPushWindow {
  const end = new Date(endMs);
  end.setSeconds(0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/**
 * now 기준으로 “오늘 저녁 발송”에 쓸 판정 구간.
 * - 20:00 전: 어제 20:00 ~ 오늘 20:00
 * - 20:00 이후: 오늘 20:00 ~ 내일 20:00 (다음날 발송용)
 */
export function getJudgmentWindowForNow(nowMs: number): EveningPushWindow {
  const now = new Date(nowMs);
  const today20 = new Date(now);
  today20.setHours(20, 0, 0, 0);
  if (nowMs < today20.getTime()) {
    return getJudgmentWindowEndingAt(today20.getTime());
  }
  const tomorrow20 = new Date(today20);
  tomorrow20.setDate(tomorrow20.getDate() + 1);
  return getJudgmentWindowEndingAt(tomorrow20.getTime());
}

/** 20:00~20:05 사이 SMS 푸시용: 방금 닫힌 구간(어제 20 ~ 오늘 20) */
export function getClosedJudgmentWindowForSmsBuffer(nowMs: number): EveningPushWindow | null {
  const now = new Date(nowMs);
  const today20 = new Date(now);
  today20.setHours(20, 0, 0, 0);
  const today2005 = new Date(now);
  today2005.setHours(20, 5, 0, 0);
  if (nowMs < today20.getTime() || nowMs >= today2005.getTime()) {
    return null;
  }
  return getJudgmentWindowEndingAt(today20.getTime());
}

export function decideEveningGeneralPush(input: EveningPushInputs): EveningPushDecision {
  const { hasExpenseCreatedInWindow, smsReceivedCount, smsUnconvertedCount } = input;

  if (smsUnconvertedCount > 0) {
    return { kind: 'sms_inbox_reminder', smsCount: smsUnconvertedCount };
  }

  // 가기록 수신 후 전부 소비로 전환 → 두 푸시 모두 미발송
  if (smsReceivedCount > 0) {
    return { kind: 'none', smsCount: 0 };
  }

  if (!hasExpenseCreatedInWindow) {
    return { kind: 'expense_reminder', smsCount: 0 };
  }

  return { kind: 'none', smsCount: 0 };
}

export function buildSmsInboxReminderBody(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return `${n}건의 지출을 수신했습니다. 기록으로 생성하여 소비 흐름을 관리해 보세요.`;
}
