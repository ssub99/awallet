import { useEffect, useRef, useState } from 'react';

const COUNT_UP_DURATION = 400;

/** `triggerKey`가 바뀔 때만 이전 값에서 `target`까지 숫자를 굴린다. 그 외의 값 변경은 바로 반영. */
export function useCountUp(target: number, triggerKey: string): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const keyRef = useRef(triggerKey);

  useEffect(() => {
    const duration = keyRef.current === triggerKey ? 0 : COUNT_UP_DURATION;
    keyRef.current = triggerKey;
    const from = displayRef.current;
    const startedAt = Date.now();
    let frame = requestAnimationFrame(function step() {
      const progress = duration === 0 ? 1 : Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      displayRef.current = Math.round(from + (target - from) * eased);
      setDisplay(displayRef.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, triggerKey]);

  return display;
}
