/**
 * 기록 수신 안내 카드 탭 → 홈 포커스 후 간편입력·수신함 오픈.
 * set 시 구독 알림. 홈이 포커스가 아니면 소비하지 않고 pending 유지.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

/** 홈에서 간편입력 + 기록 수신함 오픈을 예약하고 구독자에게 알린다 */
export function setHomePendingOpenRecordInbox(): void {
  pending = true;
  listeners.forEach((listener) => {
    listener();
  });
}

/** 홈이 준비된 뒤 호출. true면 오픈 실행 후 비운다 */
export function consumeHomePendingOpenRecordInbox(): boolean {
  if (!pending) {
    return false;
  }
  pending = false;
  return true;
}

export function subscribeHomePendingOpenRecordInbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
