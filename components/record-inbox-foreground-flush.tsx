/** 포그라운드 네이티브 큐 enqueue → flush. 화면은 열지 않고 인디케이터만 표시.
 *  append 성공 시 홈 「기록 수신 안내」카드 3초 예약.
 *  Android 아이콘 뱃지 알림 탭 → flush 후 수신함 오픈.
 */

import { useLoading } from '@/contexts/loading-context';
import {
  handleRecordInboxBadgeNotificationOpen,
  subscribeRecordInboxBadgeNotificationOpen,
} from '@/utils/record-inbox-badge-open';
import {
  flushPendingRecordInboxFromNative,
  subscribeRecordInboxPendingEnqueued,
} from '@/utils/record-inbox-native-queue';
import { scheduleRecordReceiveGuideCard } from '@/utils/record-receive-guide-card-event';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function RecordInboxForegroundFlush() {
  const { setLoading } = useLoading();
  const generationRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return undefined;
    }

    return subscribeRecordInboxPendingEnqueued(() => {
      const generation = ++generationRef.current;
      void (async () => {
        setLoading(true);
        try {
          const appended = await flushPendingRecordInboxFromNative();
          if (appended > 0 && generation === generationRef.current) {
            scheduleRecordReceiveGuideCard(appended);
          }
        } finally {
          if (generation === generationRef.current) {
            setLoading(false);
          }
        }
      })();
    });
  }, [setLoading]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    return subscribeRecordInboxBadgeNotificationOpen(() => {
      void handleRecordInboxBadgeNotificationOpen();
    });
  }, []);

  return null;
}
