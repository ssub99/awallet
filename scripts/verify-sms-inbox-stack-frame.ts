/**
 * 문자 수신함 카드 스택 프레임 회귀.
 * 스택이 짧아질 때 없는 카드의 모션(유입·퇴장)이 남지 않아야 함.
 */

import {
  buildStackFrame,
  SlotMotion,
  STACK_FRAME_CAPACITY,
  type StackTransition,
} from '../utils/sms-inbox-stack-frame';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function shape(count: number, index: number, transition: StackTransition): string {
  return buildStackFrame(count, index, transition)
    .map((slot) => `${slot.itemIndex}:${slot.motion}`)
    .join(' ');
}

function main(): void {
  // 풀스택(뒤에 여유 있음): 다음 = 퇴장 + 롤업 + 유입
  assert(
    shape(10, 0, 'forward') ===
      `0:${SlotMotion.exitUp} 1:${SlotMotion.midToFront} 2:${SlotMotion.thirdToMid} 3:${SlotMotion.enterFromBelow}`,
    `forward full: ${shape(10, 0, 'forward')}`,
  );

  // 3장만 남음: 유입 카드가 없으므로 enterFromBelow 슬롯 자체가 없어야 함
  const tail3 = buildStackFrame(3, 0, 'forward');
  assert(tail3.length === 3, `tail3 len: ${tail3.length}`);
  assert(
    tail3.every((slot) => slot.motion !== SlotMotion.enterFromBelow),
    `tail3 has phantom incoming: ${shape(3, 0, 'forward')}`,
  );

  // 2장·1장에서도 유입 없음 + 마지막 1장은 퇴장만
  assert(
    buildStackFrame(2, 0, 'forward').length === 2,
    `tail2 len: ${buildStackFrame(2, 0, 'forward').length}`,
  );
  assert(
    shape(1, 0, 'forward') === `0:${SlotMotion.exitUp}`,
    `last only exit: ${shape(1, 0, 'forward')}`,
  );

  // 이전 = 복귀 + 롤다운 + third 퇴장 (다음의 대칭)
  assert(
    shape(10, 3, 'backward') ===
      `2:${SlotMotion.enterFromAbove} 3:${SlotMotion.frontToMid} 4:${SlotMotion.midToThird} 5:${SlotMotion.exitDown}`,
    `backward full: ${shape(10, 3, 'backward')}`,
  );

  // 첫 카드 러버밴드: 복귀 카드가 없어야 함 (있는 카드만 살짝 밀림)
  const rubber = buildStackFrame(10, 0, 'backward');
  assert(
    rubber.every((slot) => slot.motion !== SlotMotion.enterFromAbove),
    `rubber has phantom return: ${shape(10, 0, 'backward')}`,
  );

  // 마지막에서 이전: third 퇴장 슬롯 없음 (그 자리에 카드가 없으므로)
  const fromLast = buildStackFrame(10, 9, 'backward');
  assert(
    fromLast.every((slot) => slot.motion !== SlotMotion.exitDown),
    `last backward has phantom exitDown: ${shape(10, 9, 'backward')}`,
  );
  assert(
    shape(10, 9, 'backward') === `8:${SlotMotion.enterFromAbove} 9:${SlotMotion.frontToMid}`,
    `last backward: ${shape(10, 9, 'backward')}`,
  );

  // idle은 보이는 3장만
  assert(
    shape(10, 0, 'idle') ===
      `0:${SlotMotion.holdFront} 1:${SlotMotion.holdMid} 2:${SlotMotion.holdThird}`,
    `idle: ${shape(10, 0, 'idle')}`,
  );

  // 모든 길이·인덱스·전환에서: 슬롯 수 한도 · itemIndex 범위 · 모션 중복 없음
  const transitions: StackTransition[] = ['idle', 'forward', 'backward'];
  for (let count = 0; count <= 6; count++) {
    for (let index = 0; index < Math.max(count, 1); index++) {
      for (const transition of transitions) {
        const frame = buildStackFrame(count, index, transition);
        assert(
          frame.length <= STACK_FRAME_CAPACITY,
          `capacity ${count}/${index}/${transition}: ${frame.length}`,
        );
        const seenItems = new Set<number>();
        const seenMotions = new Set<number>();
        for (const slot of frame) {
          assert(
            slot.itemIndex >= 0 && slot.itemIndex < count,
            `range ${count}/${index}/${transition}: ${slot.itemIndex}`,
          );
          assert(
            !seenItems.has(slot.itemIndex),
            `dup item ${count}/${index}/${transition}: ${slot.itemIndex}`,
          );
          assert(
            !seenMotions.has(slot.motion),
            `dup motion ${count}/${index}/${transition}: ${slot.motion}`,
          );
          seenItems.add(slot.itemIndex);
          seenMotions.add(slot.motion);
        }
      }
    }
  }

  // forward 종료 = index+1의 idle, backward 종료 = index-1의 idle 과 카드 구성이 같아야 함
  for (let count = 1; count <= 6; count++) {
    for (let index = 0; index < count; index++) {
      if (index + 1 < count) {
        const moving = buildStackFrame(count, index, 'forward')
          .filter((slot) => slot.motion !== SlotMotion.exitUp)
          .map((slot) => slot.itemIndex);
        const settled = buildStackFrame(count, index + 1, 'idle').map((slot) => slot.itemIndex);
        assert(
          moving.join(',') === settled.join(','),
          `forward settle ${count}/${index}: ${moving} vs ${settled}`,
        );
      }
      if (index - 1 >= 0) {
        const moving = buildStackFrame(count, index, 'backward')
          .filter((slot) => slot.motion !== SlotMotion.exitDown)
          .map((slot) => slot.itemIndex);
        const settled = buildStackFrame(count, index - 1, 'idle').map((slot) => slot.itemIndex);
        assert(
          moving.join(',') === settled.join(','),
          `backward settle ${count}/${index}: ${moving} vs ${settled}`,
        );
      }
    }
  }

  console.log('sms-inbox stack frame OK');
}

main();
