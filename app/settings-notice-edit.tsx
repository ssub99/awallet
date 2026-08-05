/**
 * Settings Notice Edit Screen
 *
 * Edit locally published dev notices. Matches compose layout with pre-filled content.
 */

import { NoticeFormScreen } from '@/components/ui/notice-form-screen';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { getDevAppNoticeById, updateDevAppNotice } from '@/utils/dev-app-notices';
import type { AppNotice } from '@/utils/fetch-app-notices';
import { DEV_NOTICE_UPLOAD_GUIDE, getDevNoticeSyncFailureToast } from '@/utils/dev-notices-sync';
import { isLocalDevOnlyUIEnabled } from '@/utils/dev-only-ui';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function buildNoticeUpdatePayload(
  existing: AppNotice,
  title: string,
  body: string,
  images: string[],
  videos: string[],
): AppNotice {
  const next: AppNotice = {
    ...existing,
    title,
    body,
    images,
  };
  if (videos.length > 0) {
    next.videos = videos;
  } else {
    delete next.videos;
  }
  return next;
}

export default function SettingsNoticeEditScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { setLoading } = useLoading();
  const params = useLocalSearchParams<{ noticeId?: string | string[] }>();
  const noticeId = typeof params.noticeId === 'string' ? params.noticeId : params.noticeId?.[0];

  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadNotice = useCallback(async () => {
    if (!isLocalDevOnlyUIEnabled()) {
      router.back();
      return;
    }

    if (noticeId == null || noticeId.length === 0) {
      showToast('편집할 공지를 찾을 수 없습니다.');
      router.back();
      return;
    }

    setLoading(true);
    try {
      const loaded = await getDevAppNoticeById(noticeId);
      if (loaded == null) {
        showToast('로컬에서 등록한 공지만 편집할 수 있습니다.');
        router.back();
        return;
      }
      setNotice(loaded);
    } finally {
      setLoading(false);
    }
  }, [noticeId, router, setLoading, showToast]);

  useFocusEffect(
    useCallback(() => {
      if (!isLocalDevOnlyUIEnabled()) {
        router.back();
        return;
      }
      void loadNotice();
    }, [loadNotice, router]),
  );

  const initialValues = useMemo(
    () =>
      notice == null
        ? {
            title: '',
            content: '',
            images: [] as string[],
            videos: [] as string[],
          }
        : {
            title: notice.title,
            content: notice.body,
            images: notice.images,
            videos: notice.videos ?? [],
          },
    [notice],
  );

  const handleSubmit = async (values: {
    title: string;
    content: string;
    images: string[];
    videos: string[];
  }) => {
    if (isSubmitting || notice == null) {
      return;
    }

    if (values.title.length === 0) {
      showToast('제목을 입력해 주세요.');
      return;
    }
    if (values.content.length === 0) {
      showToast('내용을 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = buildNoticeUpdatePayload(
        notice,
        values.title,
        values.content,
        values.images,
        values.videos,
      );
      const { saved, synced, syncFailure } = await updateDevAppNotice(updated);
      if (!saved) {
        showToast('로컬에서 등록한 공지만 편집할 수 있습니다.');
        return;
      }
      showToast(synced ? '저장되었습니다.' : getDevNoticeSyncFailureToast(syncFailure));
      router.back();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLocalDevOnlyUIEnabled() || notice == null) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <StatusBar barStyle="dark-content" />
      </SafeAreaView>
    );
  }

  return (
    <NoticeFormScreen
      screenTitle="공지사항 편집"
      submitLabel="저장"
      submitAccessibilityLabel="저장"
      initialValues={initialValues}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      devUploadGuide={DEV_NOTICE_UPLOAD_GUIDE}
    />
  );
}
