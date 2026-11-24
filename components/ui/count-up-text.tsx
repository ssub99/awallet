/**
 * 숫자 카운트업 텍스트.
 *
 * - 처음 활성화(active)될 때는 애니메이션 없이 현재 값을 그대로 보여준다.
 * - 이후 활성 상태에서 값이 바뀌면(또는 비활성 동안 바뀐 값이 있다가 다시 활성화되면)
 *   화면에 보이던 값에서 새 값까지 카운트한다.
 * - active=false 동안은 값이 바뀌어도 화면 값을 유지한다. 홈이 보이지 않는 동안 애니메이션이
 *   끝나버리지 않도록, 홈이 다시 포커스될 때(active=true) 이전 값에서 새 값으로 올라가게 하기 위함.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, type TextProps } from 'react-native';

const DEFAULT_DURATION_MS = 700;

export interface CountUpTextProps extends Omit<TextProps, 'children'> {
  /** 목표 값 */
  value: number;
  /** 애니메이션 허용 여부 (예: 화면 포커스 중). false면 화면 값을 유지한다. */
  active: boolean;
  /** 표시 문자열 (기본: 천 단위 구분 + '원') */
  format?: (value: number) => string;
  durationMs?: number;
  /** 활성화(또는 값 변경) 후 카운트를 시작하기까지의 지연. 지연 동안은 이전 값이 그대로 보인다. 기본 0 */
  startDelayMs?: number;
  /**
   * 이 값이 바뀌면 카운트 없이 새 값으로 즉시 맞춘다 (예: 월 전환 — 다른 달 금액은 카운트업 대상이 아니다).
   * 같은 키 안에서 값이 바뀔 때만(기록 추가·삭제 등) 카운트한다.
   */
  resetKey?: string | number;
}

const defaultFormat = (value: number) => `${value.toLocaleString()}원`;

function CountUpTextInner({
  value,
  active,
  format = defaultFormat,
  durationMs = DEFAULT_DURATION_MS,
  startDelayMs = 0,
  resetKey,
  ...textProps
}: CountUpTextProps) {
  const [shown, setShown] = useState(value);
  const animatedRef = useRef<Animated.Value | null>(null);
  const seenActiveRef = useRef(false);
  const runningRef = useRef<Animated.CompositeAnimation | null>(null);
  const lastResetKeyRef = useRef(resetKey);

  // 지연 생성 (렌더 중 ref 접근 없이 effect에서만 사용)
  useEffect(() => {
    const animated = new Animated.Value(value);
    animatedRef.current = animated;
    const id = animated.addListener(({ value: next }) => setShown(Math.round(next)));
    return () => {
      animated.removeListener(id);
      runningRef.current?.stop();
    };
    // 마운트 시 1회만 생성 (value는 초기값으로만 사용)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const animated = animatedRef.current;
    if (!animated) {
      return;
    }
    // 키가 바뀌었으면(다른 달 등) 진행 중 카운트를 끊고 새 값으로 즉시 맞춘다
    if (lastResetKeyRef.current !== resetKey) {
      lastResetKeyRef.current = resetKey;
      runningRef.current?.stop();
      animated.setValue(value);
      return;
    }
    if (!active) {
      return;
    }
    runningRef.current?.stop();
    if (!seenActiveRef.current) {
      // 처음 활성화: 애니메이션 없이 현재 값으로 맞춘다
      seenActiveRef.current = true;
      animated.setValue(value);
      return;
    }
    const run = () => {
      const animation = Animated.timing(animated, {
        toValue: value,
        duration: durationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      runningRef.current = animation;
      animation.start(({ finished }) => {
        if (finished) {
          setShown(value);
        }
      });
    };
    // 지연 중 비활성화·값 변경이 오면 예약을 취소하고 새 값 기준으로 다시 예약한다
    const timer = setTimeout(run, startDelayMs);
    return () => clearTimeout(timer);
  }, [active, durationMs, resetKey, startDelayMs, value]);

  return (
    <Text {...textProps} accessibilityLabel={format(value)}>
      {format(shown)}
    </Text>
  );
}

export const CountUpText = memo(CountUpTextInner);
