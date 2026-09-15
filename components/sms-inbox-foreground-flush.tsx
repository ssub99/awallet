/** 포그라운드 네이티브 큐 enqueue → flush. 화면은 열지 않고 인디케이터만 표시. */

import { useLoading } from '@/contexts/loading-context';
import {
  flushPendingSmsInboxFromNative,
  subscribeSmsInboxPendingEnqueued,
} from '@/utils/sms-inbox-native-queue';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function SmsInboxForegroundFlush() {
  const { setLoading } = useLoading();
  const generationRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return undefined;
    }

    return subscribeSmsInboxPendingEnqueued(() => {
      const generation = ++generationRef.current;
      void (async () => {
        setLoading(true);
        try {
          await flushPendingSmsInboxFromNative();
        } finally {
          if (generation === generationRef.current) {
            setLoading(false);
          }
        }
      })();
    });
  }, [setLoading]);

  return null;
}
