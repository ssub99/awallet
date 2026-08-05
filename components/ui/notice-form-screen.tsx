/**
 * Shared notice compose/edit form — Figma: settings.notice.compose.default
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { NoticeVideoThumbnail } from '@/components/ui/notice-video-thumbnail';
import { UiLineText } from '@/components/ui/ui-line-text';
import { themeColors } from '@/constants/theme-colors';
import { typographyLayout } from '@/constants/typography';
import { useToast } from '@/contexts/toast-context';
import { useAndroidKeyboardBottomCtaHide } from '@/hooks/use-android-keyboard-bottom-cta-hide';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { encodeNoticeMediaViewerParams } from '@/utils/notice-image-viewer-params';
import type { NoticeMediaItem } from '@/utils/notice-media';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const INPUT_PLACEHOLDER = '내용 입력';
const CONTENT_AREA_HEIGHT = 160;
const MAX_NOTICE_ATTACHMENTS = 4;
const MAX_ATTACHMENTS_TOAST = '최대 4개까지 첨부할 수 있습니다.';

export interface NoticeFormInitialValues {
  title: string;
  content: string;
  images: string[];
  videos: string[];
}

export interface NoticeFormSubmitValues {
  title: string;
  content: string;
  images: string[];
  videos: string[];
}

interface NoticeFormScreenProps {
  screenTitle: string;
  submitLabel: string;
  submitAccessibilityLabel: string;
  initialValues: NoticeFormInitialValues;
  isSubmitting: boolean;
  onSubmit: (values: NoticeFormSubmitValues) => void | Promise<void>;
  /** __DEV__ 공지 static 업로드 — sync 서버 실행 안내 */
  devUploadGuide?: string;
}

export function NoticeFormScreen({
  screenTitle,
  submitLabel,
  submitAccessibilityLabel,
  initialValues,
  isSubmitting,
  onSubmit,
  devUploadGuide,
}: NoticeFormScreenProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { showToast } = useToast();
  const {
    inputRef: titleInputRef,
    blurInput: blurTitleInput,
    hideBottomCta,
    onInputPressIn,
    onInputFocus,
    onInputBlur,
  } = useAndroidKeyboardBottomCtaHide();
  const contentInputRef = useRef<TextInput>(null);

  const [title, setTitle] = useState(initialValues.title);
  const [content, setContent] = useState(initialValues.content);
  const [images, setImages] = useState(initialValues.images);
  const [videos, setVideos] = useState(initialValues.videos);

  useEffect(() => {
    setTitle(initialValues.title);
    setContent(initialValues.content);
    setImages(initialValues.images);
    setVideos(initialValues.videos);
  }, [initialValues.content, initialValues.images, initialValues.title, initialValues.videos]);

  const attachmentCount = images.length + videos.length;

  const dismissComposeKeyboard = useCallback(() => {
    contentInputRef.current?.blur();
    blurTitleInput();
  }, [blurTitleInput]);

  const handleBack = () => {
    router.back();
  };

  const handleAddAttachment = async () => {
    dismissComposeKeyboard();

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

  const handleSubmitPress = () => {
    void onSubmit({
      title: title.trim(),
      content: content.trim(),
      images,
      videos,
    });
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
        title={screenTitle}
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
            {devUploadGuide != null && devUploadGuide.length > 0 ? (
              <View
                style={[styles.devUploadGuide, { backgroundColor: colors.background, borderColor: colors.border }]}
                accessibilityRole="text"
                accessibilityLabel={devUploadGuide}
              >
                <UiLineText style={[styles.devUploadGuideText, { color: colors.textNeutral }]}>
                  {devUploadGuide}
                </UiLineText>
              </View>
            ) : null}

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
                ref={contentInputRef}
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
                    <View
                      key={`${item.type}-${item.uri}`}
                      style={[styles.thumbnailWrap, { borderColor: colors.border }]}
                    >
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
                          <NoticeVideoThumbnail uri={item.uri} />
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
            onPress={handleSubmitPress}
            disabled={isSubmitting}
            accessibilityLabel={submitAccessibilityLabel}
          >
            {submitLabel}
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
  devUploadGuide: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  devUploadGuideText: {
    ...typographyLayout.uiLineBody01Regular,
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
