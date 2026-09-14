/**
 * 딥링크 트램폴린 (수동/레거시).
 * 기본 경로는 App Intent → App Group → flushPendingSmsInboxFromNative.
 * awallet://sms-inbox?body= 도 동일 ingest로 적재한다.
 */

import { ingestSmsInboxDeepLinkUrl } from '@/utils/sms-inbox-ingest';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function SmsInboxDeepLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ body?: string | string[]; sender?: string | string[]; text?: string | string[]; from?: string | string[] }>();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const body = firstParam(params.body) || firstParam(params.text);
    const sender = firstParam(params.sender) || firstParam(params.from);

    const run = async () => {
      try {
        if (body) {
          const query = new URLSearchParams({ body, sender }).toString();
          await ingestSmsInboxDeepLinkUrl(`awallet://sms-inbox?${query}`);
        }
      } finally {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/home');
        }
      }
    };

    void run();
  }, [params.body, params.from, params.sender, params.text, router]);

  return <View style={{ flex: 1 }} />;
}
