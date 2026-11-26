import { useCallback, useRef, useState } from 'react';
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

const DURATION = 200;
/** 손가락의 미세한 떨림에는 반응하지 않는 최소 이동 거리 */
const THRESHOLD = 4;

/**
 * 아래로 스크롤하면 숨기고 위로 스크롤하면 다시 보여 주는 하단 요소용.
 * `progress`: 0 = 보임, 1 = 숨김.
 */
export function useHideOnScroll() {
  const [progress] = useState(() => new Animated.Value(0));
  const [isHidden, setIsHidden] = useState(false);
  const hiddenRef = useRef(false);
  const offsetRef = useRef(0);
  const viewHeightRef = useRef(0);

  const setHidden = useCallback(
    (hidden: boolean) => {
      if (hiddenRef.current === hidden) return;
      hiddenRef.current = hidden;
      setIsHidden(hidden);
      Animated.timing(progress, {
        toValue: hidden ? 1 : 0,
        duration: DURATION,
        useNativeDriver: true,
      }).start();
    },
    [progress],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const maxOffset = Math.max(0, contentSize.height - layoutMeasurement.height);
      const offset = Math.min(maxOffset, Math.max(0, contentOffset.y));
      if (offset <= 0) {
        offsetRef.current = 0;
        setHidden(false);
        return;
      }
      const delta = offset - offsetRef.current;
      if (Math.abs(delta) < THRESHOLD) return;
      offsetRef.current = offset;
      setHidden(delta > 0);
    },
    [setHidden],
  );

  /** 스크롤 뷰가 새로 그려지면 맨 위에서 시작하므로 다시 보여 준다 */
  const onLayout = useCallback(
    (height: number) => {
      viewHeightRef.current = height;
      offsetRef.current = 0;
      setHidden(false);
    },
    [setHidden],
  );

  /** 내용이 줄어 스크롤할 수 없게 되면 다시 올릴 방법이 없으므로 보여 준다 */
  const onContentSizeChange = useCallback(
    (height: number) => {
      if (height <= viewHeightRef.current) setHidden(false);
    },
    [setHidden],
  );

  return { progress, isHidden, onScroll, onLayout, onContentSizeChange };
}
