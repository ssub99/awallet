/**
 * 기록 수신 안내 카드 탭 / Android 뱃지 알림 탭 → 홈 포커스 후 간편입력·수신함 오픈.
 * set 시 구독 알림. 홈이 포커스가 아니면 소비하지 않고 pending 유지.
 */

type Listener = () => void;

/** 수신함을 열게 된 진입 경로. 홈 dim 이벤트의 source 속성으로 기록된다. */
export type HomeOpenRecordInboxSource = 'record_card' | 'notice_badge';

const listeners = new Set<Listener>();
let pendingSource: HomeOpenRecordInboxSource | null = null;

/** 홈에서 간편입력 + 기록 수신함 오픈을 예약하고 구독자에게 알린다 */
export function setHomePendingOpenRecordInbox(
  source: HomeOpenRecordInboxSource = 'record_card',
): void {
  pendingSource = source;
  listeners.forEach((listener) => {
    listener();
  });
}

/** 홈이 준비된 뒤 호출. 예약이 있으면 진입 경로를 돌려주고 비운다. 없으면 null */
export function consumeHomePendingOpenRecordInbox(): HomeOpenRecordInboxSource | null {
  if (pendingSource == null) {
    return null;
  }
  const source = pendingSource;
  pendingSource = null;
  return source;
}

export function subscribeHomePendingOpenRecordInbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
