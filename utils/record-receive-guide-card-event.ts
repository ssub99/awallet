/**
 * 홈 상단 「기록 수신 안내」카드 — NoticeCard와 별도.
 * 포그라운드 ingest 성공 후 delay → emit. 연속 enqueue는 건수 합산·타이머 리셋.
 */

import { AppState } from 'react-native';

export const RECORD_RECEIVE_GUIDE_CARD_DELAY_MS = 3000;

export type RecordReceiveGuideCardPayload = {
  count: number;
};

type Listener = (payload: RecordReceiveGuideCardPayload) => void;

const listeners = new Set<Listener>();
let pendingCount = 0;
let showTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeRecordReceiveGuideCard(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitRecordReceiveGuideCard(payload: RecordReceiveGuideCardPayload): void {
  if (payload.count <= 0) {
    return;
  }
  listeners.forEach((listener) => {
    listener(payload);
  });
}

export function cancelScheduledRecordReceiveGuideCard(): void {
  if (showTimer != null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  pendingCount = 0;
}

/**
 * 추가된 건수만큼 예약. delay 동안 추가 enqueue면 건수 합산 후 타이머 재시작.
 * 발화 시 AppState가 active가 아니면 드롭.
 */
export function scheduleRecordReceiveGuideCard(
  addedCount: number,
  delayMs: number = RECORD_RECEIVE_GUIDE_CARD_DELAY_MS,
): void {
  if (addedCount <= 0) {
    return;
  }
  pendingCount += addedCount;
  if (showTimer != null) {
    clearTimeout(showTimer);
  }
  showTimer = setTimeout(() => {
    showTimer = null;
    const count = pendingCount;
    pendingCount = 0;
    if (count <= 0) {
      return;
    }
    if (AppState.currentState !== 'active') {
      return;
    }
    emitRecordReceiveGuideCard({ count });
  }, Math.max(0, delayMs));
}
