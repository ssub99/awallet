import { useEffect, useRef, useState } from 'react';

const COUNT_UP_DURATION = 400;

/**
 * `target`이 바뀌면 이전 값에서 새 값까지 숫자를 굴린다 (0원에서 오가는 경우 포함).
 * 데이터를 처음 읽은 값(`isReady`가 처음 true가 될 때)은 굴리지 않고 바로 보여 준다.
 */
export function useCountUp(target: number, isReady: boolean): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const wasReadyRef = useRef(false);

  useEffect(() => {
    const duration = wasReadyRef.current ? COUNT_UP_DURATION : 0;
    wasReadyRef.current = isReady;
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
  }, [target, isReady]);

  return display;
}
