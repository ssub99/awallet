/**
 * Settings Notice Screen
 *
 * Accordion list of app notices. Matches Figma: settings.notice.default
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { ListEmptyPlaceholder } from '@/components/ui/list-empty-placeholder';
import { NoticeVideoThumbnail } from '@/components/ui/notice-video-thumbnail';
import { ModalPopup } from '@/components/ui/modal-popup';
import { UiLineText } from '@/components/ui/ui-line-text';
import { SettingsNoticeImageViewerContent } from '@/app/settings-notice-image-viewer';
import { atomicColors } from '@/constants/atomic-colors';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { deleteDevAppNotice, loadDevAppNotices } from '@/utils/dev-app-notices';
import { isLocalDevOnlyUIEnabled } from '@/utils/dev-only-ui';
import { fetchAppNotices, type AppNotice } from '@/utils/fetch-app-notices';
import { encodeNoticeMediaViewerParams } from '@/utils/notice-image-viewer-params';
import { buildNoticeMediaItems, type NoticeMediaItem } from '@/utils/notice-media';
import { markNoticesViewed } from '@/utils/notice-read-state';
import { prefetchNoticesMedia } from '@/utils/prefetch-notice-media';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const NOTICE_EMPTY_MESSAGE = '등록된 공지사항이 없습니다.';
const NOTICE_CONTENT_FADE_IN_MS = 200;
const NOTICE_VIEWER_SLIDE_MS = 260;
const NOTICE_VIEWER_OFFSCREEN_EXTRA = 48;

const NoticeImageThumbnail = memo(function NoticeImageThumbnail({
  uri,
  colors,
}: {
  uri: string;
  colors: typeof themeColors.light;
}) {
  return (
    <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.fill }]}>
      <Icon name="image" variant="solid" size={20} color={atomicColors.neutral[300]} />
      <Image
        source={uri}
        style={styles.thumbnailImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={120}
        priority="high"
      />
    </View>
  );
});

function NoticeDevActionLink({
  label,
  accessibilityLabel,
  onPress,
  color,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.devActionLink, { color }]}>{label}</Text>
    </Pressable>
  );
}

function NoticeAccordionItem({
  notice,
  expanded,
  onToggle,
  colors,
  onMediaPress,
  onEdit,
  onDelete,
  canEditLocalNotice,
}: {
  notice: AppNotice;
  expanded: boolean;
  onToggle: () => void;
  colors: typeof themeColors.light;
  onMediaPress: (index: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  canEditLocalNotice: boolean;
}) {
  const mediaItems = useMemo(() => buildNoticeMediaItems(notice), [notice]);

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
        <View
          style={styles.noticeExpandedBody}
          pointerEvents="auto"
          accessibilityElementsHidden={false}
          importantForAccessibility="auto"
        >
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
                    <NoticeImageThumbnail uri={item.uri} colors={colors} />
                  ) : (
                    <NoticeVideoThumbnail uri={item.uri} />
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}
          {isLocalDevOnlyUIEnabled() ? (
            <View style={styles.actionRow}>
              {canEditLocalNotice ? (
                <NoticeDevActionLink
                  label="편집"
                  accessibilityLabel="공지 편집"
                  onPress={onEdit}
                  color={colors.textAssistive}
                />
              ) : null}
              <NoticeDevActionLink
                label="삭제"
                accessibilityLabel="공지 삭제"
                onPress={onDelete}
                color={colors.textAssistive}
              />
            </View>
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
  const { height: windowHeight } = useWindowDimensions();
  const { setLoading } = useLoading();
  const { showToast } = useToast();

  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDeleteNoticeId, setPendingDeleteNoticeId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [devNoticeIds, setDevNoticeIds] = useState<Set<string>>(() => new Set());
  const [isContentReady, setIsContentReady] = useState(false);
  const [androidViewer, setAndroidViewer] = useState<{
    media: NoticeMediaItem[];
    initialIndex: number;
  } | null>(null);
  const [isAndroidViewerVisible, setIsAndroidViewerVisible] = useState(false);
  const noticesRef = useRef<AppNotice[]>([]);
  const skipNextFocusLoadRef = useRef(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const androidViewerTranslateY = useRef(new Animated.Value(0)).current;
  const androidViewerSheetHeightRef = useRef(0);

  const getAndroidViewerHiddenOffset = useCallback(() => {
    return (
      Math.max(windowHeight, androidViewerSheetHeightRef.current) +
      NOTICE_VIEWER_OFFSCREEN_EXTRA
    );
  }, [windowHeight]);

  const loadNotices = useCallback(async () => {
    try {
      setIsContentReady(false);
      contentOpacity.setValue(0);
      setLoading(true);
      const [items, devItems] = await Promise.all([
        fetchAppNotices(),
        loadDevAppNotices(),
      ]);
      noticesRef.current = items;
      setNotices(items);
      setDevNoticeIds(new Set(devItems.map((notice) => notice.id)));
      void prefetchNoticesMedia(items);
    } finally {
      setLoading(false);
      setIsContentReady(true);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: NOTICE_CONTENT_FADE_IN_MS,
        useNativeDriver: true,
      }).start();
    }
  }, [contentOpacity, setLoading]);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusLoadRef.current) {
        skipNextFocusLoadRef.current = false;
      } else {
        void loadNotices();
      }

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
    if (Platform.OS === 'android') {
      androidViewerTranslateY.stopAnimation();
      androidViewerTranslateY.setValue(getAndroidViewerHiddenOffset());
      setAndroidViewer({ media, initialIndex: index });
      setIsAndroidViewerVisible(true);
      requestAnimationFrame(() => {
        Animated.timing(androidViewerTranslateY, {
          toValue: 0,
          duration: NOTICE_VIEWER_SLIDE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
      return;
    }
    skipNextFocusLoadRef.current = true;
    router.push({
      pathname: '/settings-notice-image-viewer',
      params: encodeNoticeMediaViewerParams(media, index),
    });
  };

  const handleAndroidViewerClose = useCallback(() => {
    androidViewerTranslateY.stopAnimation();
    Animated.timing(androidViewerTranslateY, {
      toValue: getAndroidViewerHiddenOffset(),
      duration: NOTICE_VIEWER_SLIDE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setIsAndroidViewerVisible(false);
      setAndroidViewer(null);
    });
  }, [androidViewerTranslateY, getAndroidViewerHiddenOffset]);

  const handleAndroidViewerSheetLayout = useCallback((event: LayoutChangeEvent) => {
    androidViewerSheetHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  const handleDeletePress = (noticeId: string) => {
    setPendingDeleteNoticeId(noticeId);
  };

  const handleEditPress = (noticeId: string) => {
    router.push({
      pathname: '/settings-notice-edit',
      params: { noticeId },
    });
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

      <TopNavigation
        type="sub"
        title="공지사항"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <View style={[styles.body, { backgroundColor: colors.fill }]}>
        {!isContentReady ? null : notices.length === 0 ? (
          <ListEmptyPlaceholder message={NOTICE_EMPTY_MESSAGE} />
        ) : (
          <Animated.View style={[styles.listArea, { opacity: contentOpacity }]}>
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
                  onEdit={() => handleEditPress(notice.id)}
                  onDelete={() => handleDeletePress(notice.id)}
                  canEditLocalNotice={devNoticeIds.has(notice.id)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </View>

      {isLocalDevOnlyUIEnabled() ? (
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

      {Platform.OS === 'android' ? (
        <Modal
          visible={isAndroidViewerVisible}
          animationType="none"
          transparent
          presentationStyle="fullScreen"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={handleAndroidViewerClose}
        >
          <SafeAreaProvider style={styles.androidViewerSafeAreaProvider}>
            <GestureHandlerRootView style={styles.androidViewerGestureRoot}>
              <Animated.View
                onLayout={handleAndroidViewerSheetLayout}
                style={[
                  styles.androidViewerSheet,
                  { transform: [{ translateY: androidViewerTranslateY }] },
                ]}
              >
                {androidViewer ? (
                  <SettingsNoticeImageViewerContent
                    media={androidViewer.media}
                    initialIndex={androidViewer.initialIndex}
                    onClose={handleAndroidViewerClose}
                  />
                ) : null}
              </Animated.View>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  androidViewerSafeAreaProvider: {
    flex: 1,
  },
  androidViewerGestureRoot: {
    flex: 1,
  },
  androidViewerSheet: {
    flex: 1,
    backgroundColor: atomicColors.neutral[900],
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  listArea: {
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
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: {
    ...StyleSheet.absoluteFillObject,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devActionLink: {
    ...typography.body02.regular,
    textDecorationLine: 'underline',
  },
  deleteConfirmMessage: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
});
