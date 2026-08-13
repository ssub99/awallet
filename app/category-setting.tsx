/**
 * Category Setting Screen
 * 
 * Screen for managing expense or income categories.
 * Allows users to view, create, and edit categories.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { UiLineText } from '@/components/ui/ui-line-text';
import { getCategoriesByType, type CategoryType } from '@/constants/categories';
import { areCategoriesSame, loadCategories } from '@/utils/categories';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import {
  applySavedOrder,
  getOrderedCategoriesFromCache,
  loadCategoryOrder,
  saveCategoryOrder,
} from '@/utils/category-order';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  unstable_batchedUpdates,
} from 'react-native';
import Sortable, {
  useItemContext,
  type SortableGridDragEndParams,
  type SortableGridRenderItem,
} from 'react-native-sortables';
import Reanimated, { useAnimatedRef, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const logCategorySettingDebug = (event: string, payload?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log('[CategorySettingDebug]', event, {
    ts: Date.now(),
    ...payload,
  });
};

const DRAG_SHADOW_ANIMATION_MS = 200;
const CATEGORY_CONTENT_FADE_IN_MS = 200;
const SORTABLE_AUTOSCROLL_THRESHOLD = 96;
const SORTABLE_AUTOSCROLL_MAX_VELOCITY = 900;
const SORTABLE_AUTOSCROLL_INTERVAL = 16;
const SORTABLE_DRAG_ACTIVATION_DELAY = 0;
const SORTABLE_DRAG_ACTIVATION_FAIL_OFFSET = 12;

// 스타일 정의 (컴포넌트 함수 밖에서 정의하여 CategoryItem에서 접근 가능하도록)
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    minHeight: 0,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 0,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  handleArea: {
    padding: 8,
    margin: -8,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    borderRadius: 16,
  },
  categoryRowActive: {
    borderRadius: 16,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryEmoji: {
    ...typography.headline04.bold,
    width: 21,
    textAlign: 'center',
  },
  categoryLabel: {},
  divider: {
    height: 1,
    marginLeft: 16,
    marginRight: 16,
  },
  emptyContainer: {
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.body01.regular,
  },
});

interface CategoryItemProps {
  item: { emoji: string; label: string; type: CategoryType };
  colors: typeof themeColors.light;
  onCategoryPress: (category: { emoji: string; label: string }) => void;
  showDivider: boolean;
}

// 드래그 아이템 컴포넌트 (애니메이션을 위한 별도 컴포넌트)
function CategoryItemBase({
  item, 
  colors,
  onCategoryPress,
  showDivider,
}: CategoryItemProps) {
  const { activationAnimationProgress } = useItemContext();

  const animatedShadowStyle = useAnimatedStyle(() => {
    const activeProgress = Number.isFinite(activationAnimationProgress.value)
      ? activationAnimationProgress.value
      : 0;
    return {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: activeProgress * 0.15,
      shadowRadius: 12,
      elevation: activeProgress * 8,
    };
  });
  
  return (
    <>
      <View
        style={{ height: 57, minHeight: 57, maxHeight: 57, overflow: 'visible' }}
      >
        <View
          style={{
            height: 56,
            minHeight: 56,
            maxHeight: 56,
            justifyContent: 'center',
            overflow: 'visible',
          }}
        >
          <Reanimated.View
            style={[
              { backgroundColor: colors.background, overflow: 'visible' },
              styles.categoryRowActive,
              animatedShadowStyle,
            ]}
          >
            <Pressable
              style={styles.categoryRow}
              onPress={() => onCategoryPress(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 카테고리 편집`}
            >
              <View style={styles.categoryLeft}>
                <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                <UiLineText style={[styles.categoryLabel, { color: colors.text }]}>
                  {item.label}
                </UiLineText>
              </View>
              <Sortable.Handle
                style={styles.handleArea}
              >
                <Icon name="handle" variant="line" size={24} color={colors.textNeutral} />
              </Sortable.Handle>
            </Pressable>
          </Reanimated.View>
        </View>
        
        {/* Divider (마지막 항목 제외, 드래그 중이 아닐 때만 표시) */}
        {showDivider && (
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        )}
      </View>
    </>
  );
}

const CategoryItem = React.memo(
  CategoryItemBase,
  (prev, next) =>
    prev.item === next.item &&
    prev.colors === next.colors &&
    prev.onCategoryPress === next.onCategoryPress &&
    prev.showDivider === next.showDivider,
);

export default function CategorySettingScreen() {
  const colors = themeColors.light;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  const { setLoading } = useLoading();
  
  const categoryType = (params.type as CategoryType) || 'expense';
  
  const initialCategories = getOrderedCategoriesFromCache(categoryType);
  const [categories, setCategories] = useState<{ emoji: string; label: string; type: CategoryType }[]>(
    () => initialCategories ?? [],
  );
  const [isListDataReady, setIsListDataReady] = useState(() => initialCategories != null);
  const contentOpacity = useRef(new RNAnimated.Value(initialCategories != null ? 1 : 0)).current;
  const scrollableRef = useAnimatedRef<ScrollView>();
  const scrollOffsetYRef = useRef(0);
  const categoriesRef = useRef(categories);
  const dragSessionIdRef = useRef(0);
  const activeDragSessionIdRef = useRef<number | null>(null);
  const dragPhaseRef = useRef<'idle' | 'dragging' | 'settling'>('idle');

  // 이전 인덱스를 추적하여 순서 변경 감지
  const previousIndexRef = useRef<number | null>(null);
  const hasTriggeredStartHapticRef = useRef<boolean>(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const draggedCategoryRowKeyRef = useRef<string | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastDragEndTimeRef = useRef<number>(0);

  const commitReorderedCategories = useCallback(
    (nextCategories: { emoji: string; label: string; type: CategoryType }[]) => {
      categoriesRef.current = nextCategories;
      unstable_batchedUpdates(() => {
        setCategories((current) =>
          areCategoriesSame(current, nextCategories) ? current : nextCategories,
        );
      });
    },
    [],
  );

  const resetContentFade = useCallback(() => {
    contentOpacity.stopAnimation();
    contentOpacity.setValue(0);
  }, [contentOpacity]);

  const startContentFadeIn = useCallback(() => {
    RNAnimated.timing(contentOpacity, {
      toValue: 1,
      duration: CATEGORY_CONTENT_FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity]);

  const applyLoadedCategories = useCallback(
    (finalCategories: { emoji: string; label: string; type: CategoryType }[]) => {
      categoriesRef.current = finalCategories;
      unstable_batchedUpdates(() => {
        setCategories((current) =>
          areCategoriesSame(current, finalCategories) ? current : finalCategories,
        );
        setIsListDataReady(true);
      });
      requestAnimationFrame(startContentFadeIn);
      previousIndexRef.current = null;
      hasTriggeredStartHapticRef.current = false;
      dragStartIndexRef.current = null;
    },
    [startContentFadeIn],
  );

  useFocusEffect(
    useCallback(() => {
      const loadCategoriesData = async () => {
        const timeSinceLastDrag = Date.now() - lastDragEndTimeRef.current;
        if (timeSinceLastDrag < 3000) {
          previousIndexRef.current = null;
          hasTriggeredStartHapticRef.current = false;
          dragStartIndexRef.current = null;
          return;
        }

        if (isDraggingRef.current) {
          return;
        }

        const cached = getOrderedCategoriesFromCache(categoryType);
        if (cached) {
          resetContentFade();
          applyLoadedCategories(cached);
          return;
        }

        resetContentFade();
        setIsListDataReady(false);
        setLoading(true);

        try {
          const [loadedCategories, savedOrder] = await Promise.all([
            loadCategories(categoryType),
            loadCategoryOrder(categoryType),
          ]);

          const finalCategories =
            savedOrder && savedOrder.length > 0
              ? applySavedOrder(loadedCategories, savedOrder)
              : loadedCategories;

          applyLoadedCategories(finalCategories);
        } catch (error) {
          console.error('카테고리 설정 로드 실패:', error);
          applyLoadedCategories(getCategoriesByType(categoryType));
        } finally {
          setLoading(false);
        }
      };

      void loadCategoriesData();
    }, [applyLoadedCategories, categoryType, resetContentFade, setLoading]),
  );

  // 카테고리 타입에 따라 타이틀 설정
  const title = categoryType === 'expense' ? '지출 카테고리 설정' : '수입 카테고리 설정';

  const handleBack = () => {
    router.back();
  };

  const handleCreate = () => {
    router.push({
      pathname: '/category-create' as any,
      params: { type: categoryType },
    });
  };

  const handleCategoryPress = useCallback((category: { emoji: string; label: string }) => {
    router.push({
      pathname: '/category-edit' as any,
      params: {
        type: categoryType,
        emoji: category.emoji,
        label: category.label,
      },
    });
  }, [categoryType, router]);

  // 드래그 시작 핸들러
  const handleDragStart = useCallback(({ key, fromIndex }: { key: string; fromIndex: number }) => {
    if (dragPhaseRef.current !== 'idle') {
      if (!isDraggingRef.current) {
        // stale phase 정리 후 드래그 시작 허용
        dragPhaseRef.current = 'idle';
        activeDragSessionIdRef.current = null;
        hasTriggeredStartHapticRef.current = false;
      } else {
        logCategorySettingDebug('drag:start(skip duplicated)', {
          index: fromIndex,
          scrollY: scrollOffsetYRef.current,
          phase: dragPhaseRef.current,
        });
        return;
      }
    }
    logCategorySettingDebug('drag:start', {
      index: fromIndex,
      scrollY: scrollOffsetYRef.current,
      categoryType,
    });

    dragPhaseRef.current = 'dragging';
    dragSessionIdRef.current += 1;
    activeDragSessionIdRef.current = dragSessionIdRef.current;
    isDraggingRef.current = true;
    draggedCategoryRowKeyRef.current = key;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    hasTriggeredStartHapticRef.current = true;
    dragStartIndexRef.current = fromIndex;
    previousIndexRef.current = fromIndex;
  }, [categoryType]);

  // 플레이스홀더 인덱스 변경 감지 (순서 변경 시)
  const handleOrderChange = useCallback(({ toIndex }: { toIndex: number }) => {
    logCategorySettingDebug('drag:placeholderIndexChange', {
      previousIndex: previousIndexRef.current,
      nextIndex: toIndex,
      scrollY: scrollOffsetYRef.current,
    });
    // 순서 변경(placeholder index 변경) 시에는 햅틱 유지
    if (previousIndexRef.current !== null && previousIndexRef.current !== toIndex) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    previousIndexRef.current = toIndex;
  }, []);

  // 드래그 종료 핸들러
  const handleDragEnd = useCallback(({ data, fromIndex, toIndex }: SortableGridDragEndParams<{ emoji: string; label: string; type: CategoryType }>) => {
    const activeSessionId = activeDragSessionIdRef.current;
    if (activeSessionId == null || dragStartIndexRef.current == null) {
      return;
    }
    dragPhaseRef.current = 'settling';
    const isSameOrder = areCategoriesSame(categoriesRef.current, data);
    logCategorySettingDebug('drag:end', {
      sessionId: activeSessionId,
      isSameOrder,
      fromIndex,
      toIndex,
      scrollY: scrollOffsetYRef.current,
      labels: data.map((item) => item.label),
    });
    // 드래그 종료 시간 기록 (더 긴 시간으로 설정하여 useFocusEffect 방지)
    lastDragEndTimeRef.current = Date.now();
    
    // 드래그 상태 리셋
    isDraggingRef.current = false;
    activeDragSessionIdRef.current = null;
    previousIndexRef.current = null;
    hasTriggeredStartHapticRef.current = false;
    dragStartIndexRef.current = null;
    dragPhaseRef.current = 'idle';

    // 순서/내용이 동일하면 상태 변경을 건너뛰어 드롭 직후 자동 스크롤을 방지
    if (isSameOrder) {
      logCategorySettingDebug('drag:end(skip state update - same order)', {
        sessionId: activeSessionId,
        scrollY: scrollOffsetYRef.current,
      });
      draggedCategoryRowKeyRef.current = null;
      return;
    }

    draggedCategoryRowKeyRef.current = null;
    commitReorderedCategories(data);
    saveCategoryOrder(categoryType, data).catch((error) => {
      console.error('카테고리 순서 저장 중 오류:', error);
    });
  }, [categoryType, commitReorderedCategories]);


  // 드래그 아이템 렌더링
  const renderItem = useCallback<SortableGridRenderItem<{ emoji: string; label: string; type: CategoryType }>>(({ item, index }) => {
    const categoriesLength = categories?.length ?? 0;
    const isLast = typeof index === 'number' ? index >= categoriesLength - 1 : false;

    return (
      <CategoryItem
        item={item}
        colors={colors}
        onCategoryPress={handleCategoryPress}
        showDivider={!isLast}
      />
    );
  }, [colors, handleCategoryPress, categories?.length]);

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
      edges={['bottom']}
    >
      {/* Top Navigation */}
      <TopNavigation
        type="sub"
        title={title}
        showLeftIcon
        onLeftIconPress={handleBack}
        showRightButton
        rightButtonText="생성"
        onRightButtonPress={handleCreate}
      />

      {/* Category List */}
      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          {!isListDataReady ? (
            <View style={{ flex: 1 }} />
          ) : (
            <RNAnimated.View style={[{ flex: 1, opacity: contentOpacity }]}>
              {categories.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: colors.textNeutral }]}>
                    카테고리가 없습니다.
                  </Text>
                </View>
              ) : (
                <Sortable.PortalProvider>
                  <Reanimated.ScrollView
                    ref={scrollableRef as never}
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    overScrollMode="never"
                    onScroll={(event) => {
                      scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
                    }}
                  >
                    <Sortable.Grid
                      data={categories}
                      renderItem={renderItem}
                      keyExtractor={(item) => `${item.type}:${item.label}`}
                      columns={1}
                      customHandle
                      scrollableRef={scrollableRef}
                      autoScrollEnabled
                      autoScrollActivationOffset={SORTABLE_AUTOSCROLL_THRESHOLD}
                      autoScrollMaxVelocity={SORTABLE_AUTOSCROLL_MAX_VELOCITY}
                      autoScrollInterval={SORTABLE_AUTOSCROLL_INTERVAL}
                      animateScrollTo={false}
                      dragActivationDelay={SORTABLE_DRAG_ACTIVATION_DELAY}
                      dragActivationFailOffset={SORTABLE_DRAG_ACTIVATION_FAIL_OFFSET}
                      enableActiveItemSnap={false}
                      activationAnimationDuration={DRAG_SHADOW_ANIMATION_MS}
                      dropAnimationDuration={DRAG_SHADOW_ANIMATION_MS}
                      activeItemScale={1}
                      activeItemOpacity={1}
                      activeItemShadowOpacity={0}
                      inactiveItemScale={1}
                      inactiveItemOpacity={1}
                      itemEntering={null}
                      itemExiting={null}
                      itemsLayoutTransitionMode="reorder"
                      overDrag="vertical"
                      overflow="visible"
                      strategy="insert"
                      onDragStart={handleDragStart}
                      onOrderChange={handleOrderChange}
                      onDragEnd={handleDragEnd}
                    />
                  </Reanimated.ScrollView>
                </Sortable.PortalProvider>
              )}
            </RNAnimated.View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
