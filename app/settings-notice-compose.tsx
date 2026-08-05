/**
 * Settings Notice Compose Screen
 *
 * Admin form for drafting app notices. Matches Figma: settings.notice.compose.default
 */

import { NoticeFormScreen } from '@/components/ui/notice-form-screen';
import { useToast } from '@/contexts/toast-context';
import { publishDevAppNotice } from '@/utils/dev-app-notices';
import type { AppNotice } from '@/utils/fetch-app-notices';
import { DEV_NOTICE_UPLOAD_GUIDE, getDevNoticeSyncFailureToast } from '@/utils/dev-notices-sync';
import { isLocalDevOnlyUIEnabled } from '@/utils/dev-only-ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

function buildNoticeDraftPayload(
  title: string,
  body: string,
  images: string[],
  videos: string[],
): AppNotice {
  const now = Date.now();
  const date = new Date(now);
  const dateLabel = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

  return {
    id: `notice-${now}`,
    title,
    dateLabel,
    publishedAt: now,
    body,
    images,
    ...(videos.length > 0 ? { videos } : {}),
  };
}

export default function SettingsNoticeComposeScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const localDevOnlyUIEnabled = isLocalDevOnlyUIEnabled();

  const initialValues = useMemo(
    () => ({
      title: '',
      content: '',
      images: [] as string[],
      videos: [] as string[],
    }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!localDevOnlyUIEnabled) {
        router.back();
      }
    }, [localDevOnlyUIEnabled, router]),
  );

  if (!localDevOnlyUIEnabled) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']} />
    );
  }

  const handleSubmit = async (values: {
    title: string;
    content: string;
    images: string[];
    videos: string[];
  }) => {
    if (isSubmitting) {
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
      const notice = buildNoticeDraftPayload(
        values.title,
        values.content,
        values.images,
        values.videos,
      );
      const { saved, synced, syncFailure } = await publishDevAppNotice(notice);
      if (!saved) {
        return;
      }
      showToast(synced ? '공지가 등록되었습니다.' : getDevNoticeSyncFailureToast(syncFailure));
      router.replace('/settings-notice');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NoticeFormScreen
      screenTitle="공지사항 작성"
      submitLabel="등록"
      submitAccessibilityLabel="등록"
      initialValues={initialValues}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      devUploadGuide={DEV_NOTICE_UPLOAD_GUIDE}
    />
  );
}
