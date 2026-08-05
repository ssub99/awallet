/**
 * Settings Notice Compose Screen
 *
 * Admin form for drafting app notices. Matches Figma: settings.notice.compose.default
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { UiLineText } from '@/components/ui/ui-line-text';
import { themeColors } from '@/constants/theme-colors';
import { typographyLayout } from '@/constants/typography';
import { useToast } from '@/contexts/toast-context';
import { useAndroidKeyboardBottomCtaHide } from '@/hooks/use-android-keyboard-bottom-cta-hide';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { encodeNoticeMediaViewerParams } from '@/utils/notice-image-viewer-params';
import type { NoticeMediaItem } from '@/utils/notice-media';
import { publishDevAppNotice } from '@/utils/dev-app-notices';
import type { AppNotice } from '@/utils/fetch-app-notices';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const INPUT_PLACEHOLDER = '내용 입력';
const CONTENT_AREA_HEIGHT = 160;
const MAX_NOTICE_ATTACHMENTS = 4;
const MAX_ATTACHMENTS_TOAST = '최대 4개까지 첨부할 수 있습니다.';

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
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { showToast } = useToast();
  const {
    inputRef: titleInputRef,
    hideBottomCta,
    onInputPressIn,
    onInputFocus,
    onInputBlur,
  } = useAndroidKeyboardBottomCtaHide();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const attachmentCount = images.length + videos.length;

  const handleBack = () => {
    router.back();
  };

  const handleAddAttachment = async () => {
    if (attachmentCount >= MAX_NOTICE_ATTACHMENTS) {
      showToast(MAX_ATTACHMENTS_TOAST);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('사진첩 접근 권한이 필요합니다.');
      return;
    }

    const remaining = MAX_NOTICE_ATTACHMENTS - attachmentCount;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 0.85,
      videoMaxDuration: 120,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const pickedImages: string[] = [];
    const pickedVideos: string[] = [];
    for (const asset of result.assets) {
      if (asset.type === 'video') {
        pickedVideos.push(asset.uri);
      } else {
        pickedImages.push(asset.uri);
      }
    }

    const nextItems: NoticeMediaItem[] = [
      ...images.map((uri): NoticeMediaItem => ({ type: 'image', uri })),
      ...videos.map((uri): NoticeMediaItem => ({ type: 'video', uri })),
      ...pickedImages.map((uri): NoticeMediaItem => ({ type: 'image', uri })),
      ...pickedVideos.map((uri): NoticeMediaItem => ({ type: 'video', uri })),
    ].slice(0, MAX_NOTICE_ATTACHMENTS);

    setImages(nextItems.filter((item) => item.type === 'image').map((item) => item.uri));
    setVideos(nextItems.filter((item) => item.type === 'video').map((item) => item.uri));
  };

  const handleRemoveAttachment = (item: NoticeMediaItem) => {
    if (item.type === 'video') {
      setVideos((current) => current.filter((uri) => uri !== item.uri));
      return;
    }
    setImages((current) => current.filter((uri) => uri !== item.uri));
  };

  const draftMedia = useMemo(
    (): NoticeMediaItem[] => [
      ...images.map((uri): NoticeMediaItem => ({ type: 'image', uri })),
      ...videos.map((uri): NoticeMediaItem => ({ type: 'video', uri })),
    ],
    [images, videos],
  );

  const handleRegister = async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (trimmedTitle.length === 0) {
      showToast('제목을 입력해 주세요.');
      return;
    }
    if (trimmedContent.length === 0) {
      showToast('내용을 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const notice = buildNoticeDraftPayload(trimmedTitle, trimmedContent, images, videos);
      await publishDevAppNotice(notice);
      showToast('공지가 등록되었습니다.');
      router.replace('/settings-notice');
    } finally {
      setIsSubmitting(false);
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
        title="공지사항 작성"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={[styles.body, { backgroundColor: colors.fill }]}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={styles.fieldSection}>
              <UiLineText variant="body01Bold" style={[styles.label, { color: colors.text }]}>
                제목
              </UiLineText>
              <Input
                ref={titleInputRef}
                value={title}
                onChangeText={setTitle}
                placeholder={INPUT_PLACEHOLDER}
                style={styles.input}
                onPressIn={onInputPressIn}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
                accessibilityLabel="공지 제목"
              />
            </View>

            <View style={styles.fieldSection}>
              <UiLineText variant="body01Bold" style={[styles.label, { color: colors.text }]}>
                내용
              </UiLineText>
              <Input
                variant="area"
                value={content}
                onChangeText={setContent}
                placeholder={INPUT_PLACEHOLDER}
                style={styles.contentArea}
                multiline
                textAlignVertical="top"
                accessibilityLabel="공지 내용"
              />
            </View>

            <View style={styles.attachmentSection}>
              <Pressable
                style={[styles.addImageButton, { backgroundColor: colors.fill }]}
                onPress={() => {
                  void handleAddAttachment();
                }}
                accessibilityRole="button"
                accessibilityLabel="사진 또는 영상 첨부"
              >
                <Icon name="addTask" variant="line" size={24} color={colors.textNeutral} />
              </Pressable>

              {draftMedia.length > 0 ? (
                <View style={styles.imageRow}>
                  {draftMedia.map((item, index) => (
                    <View key={`${item.type}-${item.uri}`} style={[styles.thumbnailWrap, { borderColor: colors.border }]}>
                      <Pressable
                        onPress={() => {
                          router.push({
                            pathname: '/settings-notice-image-viewer',
                            params: encodeNoticeMediaViewerParams(draftMedia, index),
                          });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`첨부 ${item.type === 'video' ? '영상' : '이미지'} ${index + 1} 크게 보기`}
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
                      <Pressable
                        style={[styles.removeImageButton, { backgroundColor: colors.staticBlack }]}
                        onPress={() => handleRemoveAttachment(item)}
                        accessibilityRole="button"
                        accessibilityLabel="첨부 파일 삭제"
                        hitSlop={8}
                      >
                        <Icon name="close" variant="line" size={12} color={colors.staticWhite} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>

      {!hideBottomCta ? (
        <View style={[styles.bottomButtonContainer, { backgroundColor: colors.staticWhite }]}>
          <Button
            onPress={() => {
              void handleRegister();
            }}
            disabled={isSubmitting}
            accessibilityLabel="등록"
          >
            등록
          </Button>
        </View>
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
    gap: 24,
  },
  fieldSection: {
    gap: 8,
  },
  label: {
    ...typographyLayout.uiLineBody01Bold,
  },
  input: {
    width: '100%',
  },
  contentArea: {
    width: '100%',
    height: CONTENT_AREA_HEIGHT,
  },
  attachmentSection: {
    gap: 16,
  },
  addImageButton: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
});
