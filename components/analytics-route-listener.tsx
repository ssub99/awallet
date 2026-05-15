import { logScreenView } from '@/utils/analytics';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Expo Router 경로가 바뀔 때마다 화면 조회 이벤트를 Amplitude로 보냅니다.
 * 루트 레이아웃의 Stack과 형제로 두어 네비게이션 컨텍스트 안에서 동작합니다.
 */
export function AnalyticsRouteListener() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ type?: string | string[]; mode?: string | string[] }>();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    // Expo Router 부트 시 잠깐 `/`만 잡히는 중간 상태 — 실제 화면이 아니므로 screen_view 생략
    if (!pathname || pathname === '/') return;

    const screenName = pathname;
    let mode: 'income' | 'expense' | 'challenge' | undefined;
    if (pathname === '/expense-category') {
      const rawType = params.type;
      const categoryType = Array.isArray(rawType) ? rawType[0] : rawType;
      const rawMode = params.mode;
      const flowMode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
      mode = flowMode === 'challenge' ? 'challenge' : categoryType === 'income' ? 'income' : 'expense';
    }

    const dedupeKey = `${screenName}|${mode ?? ''}`;
    if (dedupeKey === prevRef.current) return;
    prevRef.current = dedupeKey;
    void logScreenView(screenName, mode ? { mode } : undefined);
  }, [pathname, params.mode, params.type]);

  return null;
}
