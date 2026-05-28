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
import {
  applySavedOrder,
  getOrderedCategoriesFromCache,
  loadCategoryOrder,
  saveCategoryOrder,
} from '@/utils/category-order';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const logCategorySettingDebug = (event: string, payload?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log('[CategorySettingDebug]', event, {
    ts: Date.now(),
    ...payload,
  });
};

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

// 드래그 아이템 컴포넌트 (애니메이션을 위한 별도 컴포넌트)
function CategoryItem({ 
  item, 
  drag, 
  isActive, 
  index,
  rowKey,
  colors,
  onCategoryPress,
  onRowLayout,
  onActiveStateChange,
  showDivider,
}: {
  item: { emoji: string; label: string; type: CategoryType };
  drag: () => void;
  isActive: boolean;
  index: number | undefined;
  rowKey: string;
  colors: typeof themeColors.light;
  onCategoryPress: (category: { emoji: string; label: string }) => void;
  onRowLayout: (event: LayoutChangeEvent, params: { key: string; index: number | undefined; label: string }) => void;
  onActiveStateChange: (params: { key: string; index: number | undefined; label: string; isActive: boolean }) => void;
  showDivider: boolean;
}) {
  // 그림자 애니메이션을 위한 shared value (항상 0으로 시작)
  const shadowOpacity = useSharedValue(0);
  const elevation = useSharedValue(0);
  
  // 플랫폼 확인 (컴포넌트 레벨에서, worklet 밖에서)
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  
  // isActive 변경 시 애니메이션 트리거
  useEffect(() => {
    onActiveStateChange({ key: rowKey, index, label: item.label, isActive });
    if (isActive) {
      shadowOpacity.value = withTiming(1, { duration: 200 });
      elevation.value = withTiming(8, { duration: 200 });
    } else {
      shadowOpacity.value = withTiming(0, { duration: 200 });
      elevation.value = withTiming(0, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);
  
  // 애니메이션된 스타일 (플랫폼별로 분리)
  // worklet 내부에서는 Platform.OS에 직접 접근할 수 없으므로, 외부에서 확인한 값을 사용
  const animatedShadowStyleIOS = useAnimatedStyle(() => {
    return {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: shadowOpacity.value * 0.15,
      shadowRadius: 8,
    };
  });
  
  const animatedShadowStyleAndroid = useAnimatedStyle(() => {
    return {
      elevation: elevation.value,
    };
  });
  
  const animatedShadowStyle = isIOS ? animatedShadowStyleIOS : (isAndroid ? animatedShadowStyleAndroid : {});
  
  return (
    <ScaleDecorator activeScale={1.0}>
      <View
        style={{ height: 57, minHeight: 57, maxHeight: 57, overflow: 'visible' }}
        onLayout={(event) => {
          onRowLayout(event, { key: rowKey, index, label: item.label });
        }}
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
          <Animated.View
            style={[
              { backgroundColor: colors.background, overflow: 'visible' },
              isActive && styles.categoryRowActive,
              animatedShadowStyle,
            ]}
          >
            <Pressable
              style={styles.categoryRow}
              onPress={() => !isActive && onCategoryPress(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 카테고리 편집`}
              disabled={isActive}
            >
              <View style={styles.categoryLeft}>
                <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                <UiLineText style={[styles.categoryLabel, { color: colors.text }]}>
                  {item.label}
                </UiLineText>
              </View>
              <Pressable
                onPressIn={() => {
                  drag();
                }}
                style={styles.handleArea}
                accessibilityRole="button"
                accessibilityLabel="드래그 핸들"
              >
                <Icon name="handle" variant="line" size={24} color={colors.textNeutral} />
              </Pressable>
            </Pressable>
          </Animated.View>
        </View>
        
        {/* Divider (마지막 항목 제외, 드래그 중이 아닐 때만 표시) */}
        {showDivider && (
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        )}
      </View>
    </ScaleDecorator>
  );
}

export default function CategorySettingScreen() {
  const colors = themeColors.light;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  
  const categoryType = (params.type as CategoryType) || 'expense';
  
  const [categories, setCategories] = useState<Array<{ emoji: string; label: string; type: CategoryType }>>(() => {
    return getOrderedCategoriesFromCache(categoryType) ?? getCategoriesByType(categoryType);
  });
  const [isDragAutoscrollEnabled, setIsDragAutoscrollEnabled] = useState(false);
  const scrollOffsetYRef = useRef(0);
  const previousScrollOffsetYRef = useRef(0);
  const lastScrollEventTsRef = useRef(0);
  const dragSessionIdRef = useRef(0);
  const activeDragSessionIdRef = useRef<number | null>(null);
  const dragPhaseRef = useRef<'idle' | 'dragging' | 'settling'>('idle');
  const rowLayoutYRef = useRef<Record<string, number>>({});
  const touchSessionIdRef = useRef(0);
  const touchMoveCountRef = useRef(0);

  // 이전 인덱스를 추적하여 순서 변경 감지
  const previousIndexRef = useRef<number | null>(null);
  const hasTriggeredStartHapticRef = useRef<boolean>(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastDragEndTimeRef = useRef<number>(0);

  const applyLoadedCategories = useCallback(
    (finalCategories: Array<{ emoji: string; label: string; type: CategoryType }>) => {
      setCategories((current) =>
        areCategoriesSame(current, finalCategories) ? current : finalCategories,
      );
      previousIndexRef.current = null;
      hasTriggeredStartHapticRef.current = false;
      dragStartIndexRef.current = null;
    },
    [],
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
          applyLoadedCategories(cached);
          return;
        }

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
        }
      };

      void loadCategoriesData();
    }, [applyLoadedCategories, categoryType]),
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

  const handleCategoryPress = (category: { emoji: string; label: string }) => {
    router.push({
      pathname: '/category-edit' as any,
      params: { 
        type: categoryType,
        emoji: category.emoji,
        label: category.label,
      },
    });
  };

  // 드래그 시작 핸들러
  const handleDragStart = useCallback(({ index }: { index: number }) => {
    if (dragPhaseRef.current !== 'idle') {
      if (!isDraggingRef.current) {
        // stale phase 정리 후 드래그 시작 허용
        dragPhaseRef.current = 'idle';
        activeDragSessionIdRef.current = null;
        hasTriggeredStartHapticRef.current = false;
      } else {
        logCategorySettingDebug('drag:start(skip duplicated)', {
          index,
          scrollY: scrollOffsetYRef.current,
          phase: dragPhaseRef.current,
        });
        return;
      }
    }
    logCategorySettingDebug('drag:start', {
      index,
      scrollY: scrollOffsetYRef.current,
      categoryType,
    });

    dragPhaseRef.current = 'dragging';
    dragSessionIdRef.current += 1;
    activeDragSessionIdRef.current = dragSessionIdRef.current;
    isDraggingRef.current = true;
    setIsDragAutoscrollEnabled(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    hasTriggeredStartHapticRef.current = true;
    dragStartIndexRef.current = index;
    previousIndexRef.current = index;
  }, []);

  // 플레이스홀더 인덱스 변경 감지 (순서 변경 시)
  const handlePlaceholderIndexChange = useCallback((index: number) => {
    logCategorySettingDebug('drag:placeholderIndexChange', {
      previousIndex: previousIndexRef.current,
      nextIndex: index,
      scrollY: scrollOffsetYRef.current,
    });
    // 순서 변경(placeholder index 변경) 시에는 햅틱 유지
    if (previousIndexRef.current !== null && previousIndexRef.current !== index) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    previousIndexRef.current = index;
  }, []);

  // 드래그 종료 핸들러
  const handleDragEnd = useCallback(({ data }: { data: Array<{ emoji: string; label: string; type: CategoryType }> }) => {
    const activeSessionId = activeDragSessionIdRef.current;
    if (activeSessionId == null || dragStartIndexRef.current == null) {
      return;
    }
    dragPhaseRef.current = 'settling';
    const isSameOrder = areCategoriesSame(categories, data);
    logCategorySettingDebug('drag:end', {
      sessionId: activeSessionId,
      isSameOrder,
      fromIndex: dragStartIndexRef.current,
      toIndex: previousIndexRef.current,
      scrollY: scrollOffsetYRef.current,
      labels: data.map((item) => item.label),
    });
    // 드래그 종료 시간 기록 (더 긴 시간으로 설정하여 useFocusEffect 방지)
    lastDragEndTimeRef.current = Date.now();
    
    // 드래그 상태 리셋
    isDraggingRef.current = false;
    setIsDragAutoscrollEnabled(false);
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
      return;
    }

    setCategories(data);

    // AsyncStorage에 순서 저장 (비동기로 실행하되 await하지 않음)
    saveCategoryOrder(categoryType, data)
      .then(() => {
        console.log(`[카테고리 순서 저장] ${categoryType} 타입 순서 저장 완료:`, data.map(cat => cat.label));
      })
      .catch((error) => {
        console.error('카테고리 순서 저장 중 오류:', error);
      });
  }, [categories, categoryType, saveCategoryOrder]);
  
  // 드래그 릴리스 핸들러 (드롭 시 즉시 호출)
  const handleRelease = useCallback(() => {
    const activeSessionId = activeDragSessionIdRef.current;
    if (activeSessionId == null || dragStartIndexRef.current == null) {
      return;
    }
    logCategorySettingDebug('drag:release', {
      sessionId: activeSessionId,
      scrollY: scrollOffsetYRef.current,
      dragStartIndex: dragStartIndexRef.current,
      placeholderIndex: previousIndexRef.current,
    });
    setIsDragAutoscrollEnabled(false);
    dragPhaseRef.current = 'settling';
  }, []);

  const handleRowLayout = useCallback(
    (
      event: LayoutChangeEvent,
      params: { key: string; index: number | undefined; label: string },
    ) => {
      const { key, index, label } = params;
      const y = event.nativeEvent.layout.y;
      const prevY = rowLayoutYRef.current[key];
      rowLayoutYRef.current[key] = y;

      if (prevY == null) {
        return;
      }

      const deltaY = y - prevY;
      if (Math.abs(deltaY) < 1) {
        return;
      }

      const isWatchedRow =
        index === 0 ||
        index === categories.length - 1 ||
        index === dragStartIndexRef.current ||
        index === previousIndexRef.current;

      if (!isWatchedRow && dragPhaseRef.current === 'dragging') {
        return;
      }

      logCategorySettingDebug('row:layoutShift', {
        key,
        label,
        index,
        y,
        prevY,
        deltaY,
        phase: dragPhaseRef.current,
        isDragging: isDraggingRef.current,
        scrollY: scrollOffsetYRef.current,
      });
    },
    [categories.length],
  );

  const handleRowActiveStateChange = useCallback(
    (params: { key: string; index: number | undefined; label: string; isActive: boolean }) => {
      const { key, index, label, isActive } = params;
      const shouldLog =
        isActive ||
        index === 0 ||
        index === categories.length - 1 ||
        index === dragStartIndexRef.current ||
        index === previousIndexRef.current;
      if (!shouldLog) {
        return;
      }
      logCategorySettingDebug('row:activeStateChange', {
        key,
        label,
        index,
        isActive,
        phase: dragPhaseRef.current,
        isDragging: isDraggingRef.current,
        scrollY: scrollOffsetYRef.current,
      });

    },
    [categories.length],
  );


  // 드래그 아이템 렌더링
  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<{ emoji: string; label: string; type: CategoryType }>) => {
    const index = getIndex();
    const categoriesLength = categories?.length ?? 0;
    const isLast = typeof index === 'number' ? index >= categoriesLength - 1 : false;
    
    return (
      <CategoryItem
        item={item}
        drag={drag}
        isActive={isActive}
        index={index}
        rowKey={`${item.type}:${item.label}`}
        colors={colors}
        onCategoryPress={handleCategoryPress}
        onRowLayout={handleRowLayout}
        onActiveStateChange={handleRowActiveStateChange}
        showDivider={!isLast && !isActive}
      />
    );
  }, [colors, handleCategoryPress, handleRowLayout, handleRowActiveStateChange, categories?.length]);

  // Placeholder 렌더링 (드래그 중 원래 위치에 표시)
  const renderPlaceholder = useCallback(({ item }: { item: { emoji: string; label: string; type: CategoryType } }) => {
    return (
      <View style={{ height: 57, minHeight: 57, maxHeight: 57, overflow: 'visible' }}>
        <View style={{ 
          height: 56, 
          minHeight: 56, 
          maxHeight: 56,
          backgroundColor: colors.background,
        }} />
      </View>
    );
  }, [colors]);

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
      edges={['bottom']}
    >
      <StatusBar barStyle="dark-content" />
      
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
          {categories.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textNeutral }]}>
                카테고리가 없습니다.
              </Text>
            </View>
          ) : (
            <DraggableFlatList
              data={categories}
              initialNumToRender={categories.length}
              maxToRenderPerBatch={categories.length}
              updateCellsBatchingPeriod={0}
              windowSize={Math.max(5, categories.length)}
              onDragBegin={(index: number) => {
                handleDragStart({ index });
              }}
              onPlaceholderIndexChange={handlePlaceholderIndexChange}
              onRelease={handleRelease}
              onDragEnd={handleDragEnd}
              animationConfig={{
                damping: 50,
                stiffness: 1000,
                mass: 0.5,
                overshootClamping: true,
              }}
              keyExtractor={(item) => item.label}
              renderItem={renderItem}
              renderPlaceholder={renderPlaceholder}
              contentContainerStyle={styles.scrollContent}
              getItemLayout={(data, index) => ({
                length: 57, // 56 (row) + 1 (divider)
                offset: 57 * index,
                index,
              })}
              removeClippedSubviews={false}
              autoscrollThreshold={isDragAutoscrollEnabled ? 56 : 0}
              autoscrollSpeed={isDragAutoscrollEnabled ? 48 : 0}
              onScrollOffsetChange={(offset: number) => {
                scrollOffsetYRef.current = offset;
              }}
              onScroll={(event) => {
                const nextY = event.nativeEvent.contentOffset.y;
                const now = Date.now();
                const prevY = previousScrollOffsetYRef.current;
                const deltaY = nextY - prevY;
                const dt = lastScrollEventTsRef.current === 0 ? 0 : now - lastScrollEventTsRef.current;
                scrollOffsetYRef.current = nextY;
                previousScrollOffsetYRef.current = nextY;
                lastScrollEventTsRef.current = now;

                // 자동 스크롤 의심 구간(드래그 중이 아닌데 오프셋이 이동하는 경우) 추적
                if (Math.abs(deltaY) >= 1 && dragPhaseRef.current !== 'dragging') {
                  logCategorySettingDebug('list:scroll(auto suspect)', {
                    y: nextY,
                    prevY,
                    deltaY,
                    dt,
                    phase: dragPhaseRef.current,
                    isDragging: isDraggingRef.current,
                  });
                }
              }}
              onScrollBeginDrag={() => {
                logCategorySettingDebug('list:scrollBeginDrag', {
                  scrollY: scrollOffsetYRef.current,
                  phase: dragPhaseRef.current,
                  isDragging: isDraggingRef.current,
                });
              }}
              onScrollEndDrag={() => {
                logCategorySettingDebug('list:scrollEndDrag', {
                  scrollY: scrollOffsetYRef.current,
                  isDragging: isDraggingRef.current,
                  phase: dragPhaseRef.current,
                });
              }}
              onMomentumScrollBegin={() => {
                logCategorySettingDebug('list:momentumScrollBegin', {
                  scrollY: scrollOffsetYRef.current,
                  phase: dragPhaseRef.current,
                  isDragging: isDraggingRef.current,
                });
              }}
              onMomentumScrollEnd={() => {
                if (dragPhaseRef.current === 'idle' && Math.abs(scrollOffsetYRef.current) < 0.5) {
                  return;
                }
                logCategorySettingDebug('list:momentumScrollEnd', {
                  scrollY: scrollOffsetYRef.current,
                  isDragging: isDraggingRef.current,
                  phase: dragPhaseRef.current,
                });
              }}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
