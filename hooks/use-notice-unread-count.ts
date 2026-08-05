import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchAppNotices } from '@/utils/fetch-app-notices';
import {
  countUnreadNotices,
  ensureNoticeInstallBaseline,
  getNoticeLastViewedWatermark,
  noticeUnreadEvent,
} from '@/utils/notice-read-state';

export function useNoticeUnreadCount(): number {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    const [notices, installBaselineAt] = await Promise.all([
      fetchAppNotices(),
      ensureNoticeInstallBaseline(),
    ]);
    const lastViewedWatermark = await getNoticeLastViewedWatermark(installBaselineAt);
    setUnreadCount(countUnreadNotices(notices, installBaselineAt, lastViewedWatermark));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return noticeUnreadEvent.subscribe(() => {
        void refresh();
      });
    }, [refresh]),
  );

  return unreadCount;
}
