import { logScreenView } from '@/utils/analytics';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Expo Router 경로가 바뀔 때마다 화면 조회 이벤트를 Amplitude로 보냅니다.
 * 루트 레이아웃의 Stack과 형제로 두어 네비게이션 컨텍스트 안에서 동작합니다.
 */
export function AnalyticsRouteListener() {
  const pathname = usePathname();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === prevRef.current) return;
    prevRef.current = pathname;
    void logScreenView(pathname);
  }, [pathname]);

  return null;
}
