/**
 * Home list view — 하단 간편입력 독.
 * 딤 이후 나타나는 간편입력 롱버전 UI(칩 3개 + QuickInputField)와 동일한 구성·스타일.
 * 보내기 버튼 자리는 홈의 FAB이 차지한다 (QuickInputField hideSendButton).
 * FAB은 홈 화면이 별도로 그린다.
 *
 * 입력창·칩을 누르면 기존 간편입력 오버레이를 연다.
 */

import { Icon } from '@/components/ui/icon';
import { QuickInputField } from '@/components/ui/quick-input-field';
import type { QuickInputShortHandle } from '@/components/ui/quick-input-short';
import { atomicColors } from '@/constants/atomic-colors';
import { getRandomQuickInputPlaceholder } from '@/constants/quick-input-placeholders';
import { type QuickInputChipAction, useQuickInputContext } from '@/contexts/quick-input-context';
import { logEvent } from '@/utils/analytics';
import { HOME_MONTH_LIST_SCREEN_NAME } from '@/utils/home-screen-name';
import type { ComponentRef, Ref } from 'react';
import { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const FIELD_HEIGHT = 48;
const MIN_BOTTOM = 16;
const FALLBACK_ESTIMATE = 64;
/** FAB 48 + 입력창과의 간격 8 + 우측 여백 16 */
const FAB_AREA_WIDTH = 48 + 8 + 16;

export interface HomeListQuickInputDockProps {
  /** 입력창 하단 ↔ 화면 하단 (FAB·숏과 동일 기준) */
  bottom: number;
  starScale: Animated.Value;
  starRotate: Animated.Value;
  /** 입력창 탭 → 간편입력 열기 (키패드 포함) */
  onInputPress: (shortBottomFromScreen: number) => void;
  /** 칩 탭 → 간편입력을 키패드 없이 열고 기능 진입 */
  onChipPress: (action: QuickInputChipAction, shortBottomFromScreen: number) => void;
  controlRef?: Ref<QuickInputShortHandle>;
  /** true면 입력창만 숨긴다 (간편입력 입력 UI가 올라와 있는 동안 — 칩은 제자리에 유지) */
  fieldHidden?: boolean;
}

const CHIPS: {
  action: QuickInputChipAction;
  label: string;
  icon: 'message' | 'calculator' | 'categorySetting';
}[] = [
  {
    action: 'recordInbox',
    label: '기록 수신함',
    icon: 'message',
  },
  {
    action: 'calculator',
    label: '계산기',
    icon: 'calculator',
  },
  {
    action: 'categorySetting',
    label: '카테고리 설정',
    icon: 'categorySetting',
  },
];

export function HomeListQuickInputDock({
  bottom,
  starScale,
  starRotate,
  onInputPress,
  onChipPress,
  controlRef,
  fieldHidden = false,
}: HomeListQuickInputDockProps) {
  const { recordInboxUnreadCount } = useQuickInputContext();
  const fieldAnchorRef = useRef<ComponentRef<typeof View>>(null);
  const lastBottomRef = useRef<number | null>(null);
  const [placeholder] = useState(() => getRandomQuickInputPlaceholder());

  /** 입력창 실측 하단 → 오버레이가 같은 위치에 올라오도록 shortBottom 산출 */
  const measureFieldBottom = useCallback(
    (done: (shortBottomFromScreen: number) => void) => {
      requestAnimationFrame(() => {
        fieldAnchorRef.current?.measureInWindow((_x, y, _width, height) => {
          const screenHeight = Dimensions.get('window').height;
          const measured = screenHeight - (y + height);
          const valid =
            height >= FIELD_HEIGHT * 0.5 &&
            measured >= 0 &&
            measured <= screenHeight - 20 &&
            y >= -100 &&
            y <= screenHeight + 100;
          if (valid) {
            lastBottomRef.current = measured;
            done(measured);
            return;
          }
          done(
            lastBottomRef.current ??
              Math.max(MIN_BOTTOM, Math.min(screenHeight - 80, bottom + FALLBACK_ESTIMATE)),
          );
        });
      });
    },
    [bottom],
  );

  const openInput = useCallback(() => {
    measureFieldBottom(onInputPress);
  }, [measureFieldBottom, onInputPress]);

  // 기록 수신 안내·알림 등 기존 진입 경로가 숏과 동일한 핸들로 간편입력을 연다
  useImperativeHandle(controlRef, () => ({ openWithoutLog: openInput }), [openInput]);

  const badgeLabel = recordInboxUnreadCount > 99 ? '99+' : String(recordInboxUnreadCount);

  return (
    <View style={[styles.root, { bottom }]} pointerEvents="box-none">
      {/* 칩 행: 롱버전과 동일 (화면 풀폭, 좌우 16 content padding, gap 8) + 가로 스크롤 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.actionRowScroll}
        contentContainerStyle={styles.actionRow}
        keyboardShouldPersistTaps="handled"
      >
        {CHIPS.map((chip) => (
          <Pressable
            key={chip.action}
            style={styles.actionChip}
            onPress={() => {
              measureFieldBottom((shortBottom) => onChipPress(chip.action, shortBottom));
            }}
            accessibilityRole="button"
            accessibilityLabel={
              chip.action === 'recordInbox' && recordInboxUnreadCount > 0
                ? `${chip.label}, 미처리 ${recordInboxUnreadCount}건`
                : chip.label
            }
          >
            <View style={styles.actionIconBox}>
              <Icon name={chip.icon} variant="solid" size={24} />
            </View>
            <Text style={styles.actionLabel}>{chip.label}</Text>
            {chip.action === 'recordInbox' && recordInboxUnreadCount > 0 ? (
              <View style={styles.actionBadge} accessibilityElementsHidden>
                <Text style={styles.actionBadgeLabel}>{badgeLabel}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      {/* 입력창: 롱버전 QuickInputField 그대로 (플레이스홀더 포함). 탭하면 간편입력 오픈 */}
      <Pressable
        ref={fieldAnchorRef}
        collapsable={false}
        style={[styles.fieldWrap, fieldHidden && styles.fieldWrapHidden]}
        pointerEvents={fieldHidden ? 'none' : 'auto'}
        onPress={() => {
          void logEvent('component', {
            screen_name: HOME_MONTH_LIST_SCREEN_NAME,
            entry_screen: 'home_month_list',
            target: 'dim',
            source: 'tap',
          });
          openInput();
        }}
        accessibilityRole="button"
        accessibilityLabel="기록 간편입력"
      >
        <View pointerEvents="none">
          <QuickInputField
            value=""
            placeholder={placeholder}
            starScale={starScale}
            starRotate={starRotate}
            editable={false}
            hideSendButton
          />
        </View>
      </Pressable>
    </View>
  );
}

// 칩 구성·크기는 contexts/quick-input-context.tsx 롱버전 칩과 동일. 배경은 시안(Static/White)
const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    gap: 12,
  },
  actionRowScroll: {
    flexGrow: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  actionChip: {
    height: 40,
    borderRadius: 24,
    backgroundColor: atomicColors.common[0],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionIconBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    lineHeight: 21,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  actionBadge: {
    minHeight: 18,
    borderRadius: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: atomicColors.red[500],
  },
  actionBadgeLabel: {
    color: atomicColors.common[0],
    fontFamily: 'Pretendard-Bold',
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  fieldWrap: {
    marginLeft: 16,
    marginRight: FAB_AREA_WIDTH,
  },
  fieldWrapHidden: {
    opacity: 0,
  },
});
