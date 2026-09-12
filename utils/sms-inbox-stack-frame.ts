/**
 * 문자 수신함 카드 스택의 한 프레임 = (어떤 카드가, 어떤 모션으로) 목록.
 *
 * 슬롯 모션을 animKind·progress 부호·끝단 플래그 조합으로 추론하면
 * 스택이 3장 미만으로 짧아질 때 존재하지 않는 카드의 모션이 남는다.
 * 여기서 카드 유무를 확정해 프레임을 만들고, 애니메이션은 motion만 보고 그린다.
 */

/** 워클렛에서 분기하므로 숫자 상수 */
export const SlotMotion = {
  holdFront: 1,
  holdMid: 2,
  holdThird: 3,
  /** 앞카드가 위로 퇴장 (다음·추가·취소 공통) */
  exitUp: 4,
  midToFront: 5,
  thirdToMid: 6,
  /** 비어 있는 third를 아래에서 채움 */
  enterFromBelow: 7,
  /** 퇴장 궤적의 역순으로 앞으로 복귀 (이전) */
  enterFromAbove: 8,
  frontToMid: 9,
  midToThird: 10,
  /** third가 아래로 퇴장 — exitUp의 대칭 */
  exitDown: 11,
} as const;

export type SlotMotionValue = (typeof SlotMotion)[keyof typeof SlotMotion];

/**
 * forward = 다음 / 추가 / 취소 (앞카드 퇴장 + 롤업 + 유입)
 * backward = 이전 (복귀 + 롤다운 + third 퇴장)
 */
export type StackTransition = 'idle' | 'forward' | 'backward';

export type StackFrameSlot = {
  itemIndex: number;
  motion: SlotMotionValue;
};

/** 한 프레임에 그려지는 카드는 최대 4장 (보이는 3장 + 유입/복귀 1장) */
export const STACK_FRAME_CAPACITY = 4;

export function buildStackFrame(
  count: number,
  index: number,
  transition: StackTransition,
): StackFrameSlot[] {
  if (count <= 0) {
    return [];
  }
  const front = Math.min(Math.max(index, 0), count - 1);
  const slots: StackFrameSlot[] = [];
  const push = (itemIndex: number, motion: SlotMotionValue) => {
    if (itemIndex >= 0 && itemIndex < count) {
      slots.push({ itemIndex, motion });
    }
  };

  if (transition === 'forward') {
    push(front, SlotMotion.exitUp);
    push(front + 1, SlotMotion.midToFront);
    push(front + 2, SlotMotion.thirdToMid);
    push(front + 3, SlotMotion.enterFromBelow);
    return slots;
  }

  if (transition === 'backward') {
    push(front - 1, SlotMotion.enterFromAbove);
    push(front, SlotMotion.frontToMid);
    push(front + 1, SlotMotion.midToThird);
    push(front + 2, SlotMotion.exitDown);
    return slots;
  }

  push(front, SlotMotion.holdFront);
  push(front + 1, SlotMotion.holdMid);
  push(front + 2, SlotMotion.holdThird);
  return slots;
}
