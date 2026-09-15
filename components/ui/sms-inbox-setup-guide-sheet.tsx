/**
 * 문자 수신함 설정 가이드 bottomsheet
 * Fluid: settings.smsReceive.setupGuide
 * — 단일 guideImageBody(Neutral/200) + Step 캐러셀 · 이미지 비율 유지·디바이스 유연 대응
 */

import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { atomicColors } from '@/constants/atomic-colors';
import {
  SMS_INBOX_SETUP_GUIDE_IMAGE_ASPECT,
  SMS_INBOX_SETUP_GUIDE_IMAGE_RADIUS,
  SMS_INBOX_SETUP_GUIDE_STEPS,
} from '@/constants/sms-inbox-setup-guide';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';

export type SmsInboxSetupGuideSheetProps = {
  visible: boolean;
  onClose: () => void;
};

const DOT_SIZE = 10;
const DOT_GAP = 4;
/** Figma: sheet 375 · image 299 → content(343) 기준 약 87% */
const IMAGE_WIDTH_RATIO = 299 / 343;
/** 작은 기기에서 시트가 넘치지 않도록 이미지 높이 상한 */
const IMAGE_MAX_HEIGHT_RATIO = 0.48;

export function SmsInboxSetupGuideSheet({ visible, onClose }: SmsInboxSetupGuideSheetProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<(typeof SMS_INBOX_SETUP_GUIDE_STEPS)[number]>>(null);

  const [pageIndex, setPageIndex] = useState(0);
  /** onLayout 전에도 시트 content 폭(윈도우−패딩)으로 그려 빈 Neutral 박스가 남지 않게 함 */
  const [pageWidth, setPageWidth] = useState(() => Math.max(0, Math.round(windowWidth - 32)));

  const imageWidth = useMemo(() => {
    const width = pageWidth > 0 ? pageWidth : Math.max(0, Math.round(windowWidth - 32));
    if (width <= 0) {
      return 0;
    }
    const byRatio = width * IMAGE_WIDTH_RATIO;
    const maxByHeight =
      Math.max(windowHeight, 1) * IMAGE_MAX_HEIGHT_RATIO * SMS_INBOX_SETUP_GUIDE_IMAGE_ASPECT;
    return Math.min(width, byRatio, maxByHeight);
  }, [pageWidth, windowHeight, windowWidth]);

  const imageHeight = imageWidth > 0 ? imageWidth / SMS_INBOX_SETUP_GUIDE_IMAGE_ASPECT : 0;
  const listWidth = pageWidth > 0 ? pageWidth : Math.max(0, Math.round(windowWidth - 32));

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPageIndex(0);
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) {
        setPageIndex(first.index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const width = pageWidth > 0 ? pageWidth : Math.max(0, Math.round(windowWidth - 32));
      if (width <= 0) {
        return;
      }
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      if (next >= 0 && next < SMS_INBOX_SETUP_GUIDE_STEPS.length) {
        setPageIndex(next);
      }
    },
    [pageWidth, windowWidth],
  );

  const step = SMS_INBOX_SETUP_GUIDE_STEPS[pageIndex] ?? SMS_INBOX_SETUP_GUIDE_STEPS[0];

  return (
    <ModalBottomsheet
      visible={visible}
      title="문자 수신함 설정 가이드"
      onClose={handleClose}
      showHandle
      resizable
      dragBehavior="sheet"
      sizing="content"
      contentStyle={{ ...styles.sheetContent, backgroundColor: colors.fill }}
    >
      <View
        style={styles.body}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          if (next > 0 && next !== pageWidth) {
            setPageWidth(next);
          }
        }}
      >
        <View style={styles.copyBlock}>
          <Text style={[styles.stepTitle, { color: colors.staticBlack }]}>{step.title}</Text>
          <Text style={[styles.stepDescription, { color: colors.textAssistive }]}>
            {step.description}
          </Text>
        </View>

        <View
          style={styles.dots}
          accessibilityRole="adjustable"
          accessibilityLabel={`가이드 ${pageIndex + 1} / ${SMS_INBOX_SETUP_GUIDE_STEPS.length}`}
        >
          {SMS_INBOX_SETUP_GUIDE_STEPS.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === pageIndex ? colors.primary : atomicColors.neutral[300],
                },
              ]}
            />
          ))}
        </View>

        {listWidth > 0 && imageWidth > 0 ? (
          <FlatList
            ref={listRef}
            data={[...SMS_INBOX_SETUP_GUIDE_STEPS]}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            style={{ width: listWidth }}
            getItemLayout={(_, index) => ({
              length: listWidth,
              offset: listWidth * index,
              index,
            })}
            onMomentumScrollEnd={handleScrollEnd}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            renderItem={({ item }) => (
              <View style={[styles.page, { width: listWidth }]}>
                <View
                  style={[
                    styles.imageBody,
                    {
                      width: imageWidth,
                      height: imageHeight,
                      backgroundColor: atomicColors.neutral[200],
                      borderRadius: SMS_INBOX_SETUP_GUIDE_IMAGE_RADIUS,
                      borderColor: atomicColors.neutral[300],
                    },
                  ]}
                >
                  <Image
                    source={item.image}
                    style={{ width: imageWidth, height: imageHeight }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={item.id}
                    accessibilityLabel={item.title}
                  />
                </View>
              </View>
            )}
          />
        ) : (
          <View
            style={[
              styles.imageBodyPlaceholder,
              {
                backgroundColor: atomicColors.neutral[200],
                borderRadius: SMS_INBOX_SETUP_GUIDE_IMAGE_RADIUS,
                borderColor: atomicColors.neutral[300],
              },
            ]}
          />
        )}
      </View>
    </ModalBottomsheet>
  );
}

const styles = StyleSheet.create({
  /** Figma: nav(56) → Step title(y=80) → top inset 24 */
  sheetContent: {
    paddingTop: 24,
    paddingBottom: 8,
  },
  body: {
    alignItems: 'center',
    gap: 16,
  },
  /** Figma: title → description gap ≈ 8 */
  copyBlock: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  stepTitle: {
    ...typography.headline04.bold,
    textAlign: 'center',
  },
  stepDescription: {
    ...typography.body02.regular,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DOT_GAP,
    height: DOT_SIZE,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: 6,
  },
  page: {
    alignItems: 'center',
  },
  imageBody: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  imageBodyPlaceholder: {
    width: '100%',
    aspectRatio: SMS_INBOX_SETUP_GUIDE_IMAGE_ASPECT,
    overflow: 'hidden',
    borderWidth: 1,
  },
});
