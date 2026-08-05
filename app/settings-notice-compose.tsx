/**
 * Settings Notice Compose Screen
 *
 * Admin form for drafting app notices. Matches Figma: settings.notice.compose.default
 */

import { NoticeFormScreen } from '@/components/ui/notice-form-screen';
import { useToast } from '@/contexts/toast-context';
import { publishDevAppNotice } from '@/utils/dev-app-notices';
import type { AppNotice } from '@/utils/fetch-app-notices';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

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

  const initialValues = useMemo(
    () => ({
      title: '',
      content: '',
      images: [] as string[],
      videos: [] as string[],
    }),
    [],
  );

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
      await publishDevAppNotice(notice);
      showToast('공지가 등록되었습니다.');
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
    />
  );
}
