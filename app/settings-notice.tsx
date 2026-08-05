/**
 * Settings Notice Screen
 *
 * Accordion list of app notices. Matches Figma: settings.notice.default
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { ListEmptyPlaceholder } from '@/components/ui/list-empty-placeholder';
import { ModalPopup } from '@/components/ui/modal-popup';
import { UiLineText } from '@/components/ui/ui-line-text';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { deleteDevAppNotice } from '@/utils/dev-app-notices';
import { fetchAppNotices, type AppNotice } from '@/utils/fetch-app-notices';
import { encodeNoticeMediaViewerParams } from '@/utils/notice-image-viewer-params';
import { buildNoticeMediaItems } from '@/utils/notice-media';
import { markNoticesViewed } from '@/utils/notice-read-state';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const NOTICE_EMPTY_MESSAGE = '등록된 공지사항이 없습니다.';

function NoticeAccordionItem({
  notice,
  expanded,
  onToggle,
  colors,
  onMediaPress,
  onDelete,
}: {
  notice: AppNotice;
  expanded: boolean;
  onToggle: () => void;
  colors: typeof themeColors.light;
  onMediaPress: (index: number) => void;
  onDelete: () => void;
}) {
  const mediaItems = buildNoticeMediaItems(notice);

  return (
    <View style={[styles.noticeCard, { backgroundColor: colors.staticWhite }]}>
      <Pressable
        onPress={onToggle}
        style={styles.noticeHeaderBlock}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${notice.title}, ${expanded ? '접기' : '펼치기'}`}
      >
        <View style={styles.noticeTitleRow}>
          <UiLineText
            variant="body02Bold"
            style={[styles.noticeTitle, { color: colors.text }]}
            numberOfLines={expanded ? undefined : 2}
          >
            {notice.title}
          </UiLineText>
          <Icon
            name={expanded ? 'arrowUp' : 'arrowDown'}
            variant="line"
            size={24}
            color={colors.text}
          />
        </View>
        <Text style={[styles.noticeDate, { color: colors.textAssistive }]}>
          {notice.dateLabel}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.noticeExpandedBody}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.noticeContent, { color: colors.textNeutral }]}>
            {notice.body}
          </Text>
          {mediaItems.length > 0 ? (
            <View style={styles.imageRow}>
              {mediaItems.map((item, index) => (
                <Pressable
                  key={`${item.type}-${item.uri}`}
                  style={[styles.thumbnailWrap, { borderColor: colors.border }]}
                  onPress={() => onMediaPress(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${notice.title} 첨부 ${item.type === 'video' ? '영상' : '이미지'} ${index + 1} 크게 보기`}
                >
                  {item.type === 'image' ? (
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.thumbnail}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.videoThumbnail, { backgroundColor: colors.staticBlack }]}>
                      <Icon name="arrowRight" variant="solid" size={20} color={colors.staticWhite} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}
          {__DEV__ ? (
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel="공지 삭제"
            >
              <Text style={[styles.deleteLink, { color: colors.textAssistive }]}>
                삭제
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function SettingsNoticeScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();
  const { showToast } = useToast();

  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDeleteNoticeId, setPendingDeleteNoticeId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const noticesRef = useRef<AppNotice[]>([]);

  const loadNotices = useCallback(async () => {
    try {
      setLoading(true);
      const items = await fetchAppNotices();
      noticesRef.current = items;
      setNotices(items);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadNotices();

      return () => {
        void markNoticesViewed(noticesRef.current);
      };
    }, [loadNotices]),
  );

  const handleBack = () => {
    router.back();
  };

  const handleToggle = (noticeId: string) => {
    setExpandedId((current) => (current === noticeId ? null : noticeId));
  };

  const handleNoticeMediaPress = (notice: AppNotice, index: number) => {
    const media = buildNoticeMediaItems(notice);
    router.push({
      pathname: '/settings-notice-image-viewer',
      params: encodeNoticeMediaViewerParams(media, index),
    });
  };

  const handleDeletePress = (noticeId: string) => {
    setPendingDeleteNoticeId(noticeId);
  };

  const handleDeleteCancel = () => {
    if (!isDeleting) {
      setPendingDeleteNoticeId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (pendingDeleteNoticeId == null || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      const noticeId = pendingDeleteNoticeId;
      const deleted = await deleteDevAppNotice(noticeId);
      if (!deleted) {
        showToast('로컬에서 등록한 공지만 삭제할 수 있습니다.');
        return;
      }

      setPendingDeleteNoticeId(null);
      setExpandedId((current) => (current === noticeId ? null : current));
      await loadNotices();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.staticWhite }]}
      edges={['top', 'bottom']}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <StatusBar barStyle="dark-content" />

      <TopNavigation
        type="sub"
        title="공지사항"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <View style={[styles.body, { backgroundColor: colors.fill }]}>
        {notices.length === 0 ? (
          <ListEmptyPlaceholder message={NOTICE_EMPTY_MESSAGE} />
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            {notices.map((notice) => (
              <NoticeAccordionItem
                key={notice.id}
                notice={notice}
                expanded={expandedId === notice.id}
                onToggle={() => handleToggle(notice.id)}
                onMediaPress={(index) => handleNoticeMediaPress(notice, index)}
                onDelete={() => handleDeletePress(notice.id)}
                colors={colors}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {__DEV__ ? (
        <ModalPopup
          visible={pendingDeleteNoticeId !== null}
          title="게시물 삭제 안내"
          confirmText="확인"
          cancelText="취소"
          onConfirm={() => {
            void handleDeleteConfirm();
          }}
          onCancel={handleDeleteCancel}
          confirmDisabled={isDeleting}
          closeOnBackdrop={!isDeleting}
        >
          <Text style={[styles.deleteConfirmMessage, { color: colors.textNeutral }]}>
            해당 게시물을 삭제하시겠어요?
          </Text>
        </ModalPopup>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },
  noticeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
    gap: 16,
  },
  noticeHeaderBlock: {
    gap: 4,
  },
  noticeTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  noticeTitle: {
    flex: 1,
  },
  noticeExpandedBody: {
    gap: 16,
  },
  noticeDate: {
    ...typography.body02.regular,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  noticeContent: {
    ...typography.body02.regular,
  },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumbnailWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLink: {
    ...typography.body02.regular,
    textDecorationLine: 'underline',
  },
  deleteConfirmMessage: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
});
