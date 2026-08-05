import { TopNavigation } from '@/components/navigation/top-navigation';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { UiLineText } from '@/components/ui/ui-line-text';
import { Tag } from '@/components/ui/tag';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import {
    arePaymentSubtypesSame,
    DEFAULT_PAYMENT_SUBTYPES,
    getPaymentSubtypesMemoryCache,
    loadPaymentSubtypes,
    savePaymentSubtypes,
    type PaymentSubtype,
} from '@/utils/payment-types';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type PaymentMethodType = 'credit' | 'debit';

interface PaymentTypeItemData {
  id: string;
  type: PaymentMethodType;
  label: string;
  description: string;
  color: string;
  isDefault: boolean;
}

function toSettingItem(item: PaymentSubtype, isDefault: boolean): PaymentTypeItemData {
  return {
    id: item.id,
    type: item.type,
    label: item.label,
    description: item.description,
    color: item.color,
    isDefault,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 16, minHeight: 0 },
  card: { flex: 1, borderRadius: 16, overflow: 'hidden', minHeight: 0 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  scrollContent: { paddingTop: 4, paddingBottom: 16 },
  handleArea: { padding: 8, margin: -8 },
  rowWrap: { height: 57, minHeight: 57, maxHeight: 57, overflow: 'visible' },
  rowInnerWrap: {
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    justifyContent: 'center',
    overflow: 'visible',
  },
  paymentTypeRowActive: { borderRadius: 16 },
  paymentTypeRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  paymentTypeLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  paymentTypeIndicator: { width: 16, height: 16, borderRadius: 99, borderWidth: 1 },
  paymentTypeTextBlock: { flex: 1, marginLeft: 12 },
  paymentTypeTextBlockSingleLine: { justifyContent: 'center' },
  paymentTypeTitle: {},
  paymentTypeSubtitle: { ...typography.body02.regular },
  paymentTypeRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  divider: { height: 1, marginLeft: 16, marginRight: 16 },
});

function PaymentTypeItem({
  item,
  drag,
  isActive,
  colors,
  showDivider,
  onPress,
}: {
  item: PaymentTypeItemData;
  drag: () => void;
  isActive: boolean;
  colors: typeof themeColors.light;
  showDivider: boolean;
  onPress: (item: PaymentTypeItemData) => void;
}) {
  const shadowOpacity = useSharedValue(0);
  const elevation = useSharedValue(0);
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';

  useEffect(() => {
    if (isActive) {
      shadowOpacity.value = withTiming(1, { duration: 200 });
      elevation.value = withTiming(8, { duration: 200 });
    } else {
      shadowOpacity.value = withTiming(0, { duration: 200 });
      elevation.value = withTiming(0, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const animatedShadowStyleIOS = useAnimatedStyle(() => ({
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: shadowOpacity.value * 0.15,
    shadowRadius: 8,
  }));
  const animatedShadowStyleAndroid = useAnimatedStyle(() => ({ elevation: elevation.value }));
  const animatedShadowStyle = isIOS ? animatedShadowStyleIOS : isAndroid ? animatedShadowStyleAndroid : {};

  return (
    <ScaleDecorator activeScale={1.0}>
      <View style={styles.rowWrap}>
        <View style={styles.rowInnerWrap}>
          <Animated.View
            style={[
              { backgroundColor: colors.background, overflow: 'visible' },
              isActive && styles.paymentTypeRowActive,
              animatedShadowStyle,
            ]}
          >
            <Pressable
              style={styles.paymentTypeRow}
              onPress={() => {
                if (!isActive) onPress(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 결제 유형 편집`}
              disabled={isActive}
            >
              <View style={styles.paymentTypeLeft}>
                <View style={[styles.paymentTypeIndicator, { backgroundColor: item.color, borderColor: colors.border }]} />
                <View style={[styles.paymentTypeTextBlock, !item.description.trim() && styles.paymentTypeTextBlockSingleLine]}>
                  <UiLineText style={[styles.paymentTypeTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.label}
                  </UiLineText>
                  {item.description.trim() ? (
                    <Text style={[styles.paymentTypeSubtitle, { color: colors.textAssistive }]} numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.paymentTypeRight}>
                {item.isDefault ? <Tag label="기본" status="normal" /> : null}
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
              </View>
            </Pressable>
          </Animated.View>
        </View>
        {showDivider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
      </View>
    </ScaleDecorator>
  );
}

export default function PaymentTypeSettingScreen() {
  const colors = themeColors.light;
  const router = useRouter();
  const initialSubtypes = getPaymentSubtypesMemoryCache() ?? DEFAULT_PAYMENT_SUBTYPES;
  const [selectedFilter, setSelectedFilter] = useState<PaymentMethodType>('credit');
  const [paymentSubtypes, setPaymentSubtypes] = useState<PaymentSubtype[]>(() => initialSubtypes);
  const [isListDataReady, setIsListDataReady] = useState(() => getPaymentSubtypesMemoryCache() != null);
  const [isDragAutoscrollEnabled, setIsDragAutoscrollEnabled] = useState(false);

  const previousIndexRef = useRef<number | null>(null);
  const hasTriggeredStartHapticRef = useRef<boolean>(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastDragEndTimeRef = useRef<number>(0);
  const scrollOffsetYRef = useRef(0);
  const dragSessionIdRef = useRef(0);
  const activeDragSessionIdRef = useRef<number | null>(null);
  const dragPhaseRef = useRef<'idle' | 'dragging' | 'settling'>('idle');

  const applyLoadedSubtypes = useCallback((loaded: PaymentSubtype[]) => {
    setPaymentSubtypes((current) => (arePaymentSubtypesSame(current, loaded) ? current : loaded));
    setIsListDataReady(true);
    previousIndexRef.current = null;
    hasTriggeredStartHapticRef.current = false;
    dragStartIndexRef.current = null;
  }, []);

  const loadPaymentTypesData = useCallback(async () => {
    const cached = getPaymentSubtypesMemoryCache();
    if (cached) {
      applyLoadedSubtypes(cached);
      return;
    }

    try {
      const loaded = await loadPaymentSubtypes();
      applyLoadedSubtypes(loaded);
    } catch (error) {
      console.error('결제 유형 로드 실패:', error);
      applyLoadedSubtypes(DEFAULT_PAYMENT_SUBTYPES);
    }
  }, [applyLoadedSubtypes]);

  useFocusEffect(
    useCallback(() => {
      const timeSinceLastDrag = Date.now() - lastDragEndTimeRef.current;
      if (timeSinceLastDrag < 3000) {
        return;
      }
      if (isDraggingRef.current) {
        return;
      }
      void loadPaymentTypesData();
    }, [loadPaymentTypesData])
  );

  const paymentTypes = useMemo(() => {
    const filtered = paymentSubtypes.filter((item) => item.type === selectedFilter);
    return filtered.map((item, index) => toSettingItem(item, index === 0));
  }, [paymentSubtypes, selectedFilter]);

  const arePaymentTypeItemsSame = useCallback((a: PaymentTypeItemData[], b: PaymentTypeItemData[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]?.id !== b[i]?.id) return false;
    }
    return true;
  }, []);

  const handleDragStart = useCallback(({ index }: { index: number }) => {
    if (dragPhaseRef.current !== 'idle') {
      if (!isDraggingRef.current) {
        dragPhaseRef.current = 'idle';
        activeDragSessionIdRef.current = null;
        hasTriggeredStartHapticRef.current = false;
      } else {
        return;
      }
    }
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

  const handlePlaceholderIndexChange = useCallback((index: number) => {
    if (previousIndexRef.current !== null && previousIndexRef.current !== index) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    previousIndexRef.current = index;
  }, []);

  const handleDragEnd = useCallback(
    ({ data }: { data: PaymentTypeItemData[] }) => {
      const activeSessionId = activeDragSessionIdRef.current;
      if (activeSessionId == null || dragStartIndexRef.current == null) {
        return;
      }
      dragPhaseRef.current = 'settling';
      const isSameOrder = arePaymentTypeItemsSame(paymentTypes, data);
      lastDragEndTimeRef.current = Date.now();
      isDraggingRef.current = false;
      setIsDragAutoscrollEnabled(false);
      activeDragSessionIdRef.current = null;
      previousIndexRef.current = null;
      hasTriggeredStartHapticRef.current = false;
      dragStartIndexRef.current = null;
      dragPhaseRef.current = 'idle';

      if (isSameOrder) {
        return;
      }

      const nextSubtypes = [
        ...paymentSubtypes.filter((item) => item.type !== selectedFilter),
        ...data.map((item) => {
          const source = paymentSubtypes.find((origin) => origin.id === item.id);
          return {
            id: item.id,
            type: item.type,
            label: item.label,
            description: source?.description ?? '',
            color: item.color,
          } as PaymentSubtype;
        }),
      ];
      setPaymentSubtypes(nextSubtypes);
      savePaymentSubtypes(nextSubtypes).catch((error) => {
        console.error('결제 유형 순서 저장 중 오류:', error);
      });
    },
    [arePaymentTypeItemsSame, paymentSubtypes, paymentTypes, selectedFilter]
  );

  const handleRelease = useCallback(() => {
    if (activeDragSessionIdRef.current == null || dragStartIndexRef.current == null) {
      return;
    }
    setIsDragAutoscrollEnabled(false);
    dragPhaseRef.current = 'settling';
  }, []);

  const handlePaymentTypePress = useCallback(
    (item: PaymentTypeItemData) => {
      router.push({
        pathname: '/payment-type-edit' as any,
        params: {
          id: item.id,
          type: item.type,
          label: item.label,
          description: item.description,
          color: item.color,
        },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<PaymentTypeItemData>) => {
      const index = getIndex();
      const listLength = paymentTypes.length;
      const isLast = typeof index === 'number' ? index >= listLength - 1 : false;
      return (
        <PaymentTypeItem
          item={item}
          drag={drag}
          isActive={isActive}
          colors={colors}
          showDivider={!isLast && !isActive}
          onPress={handlePaymentTypePress}
        />
      );
    },
    [colors, handlePaymentTypePress, paymentTypes.length]
  );

  const renderPlaceholder = useCallback(
    () => (
      <View style={{ height: 57, minHeight: 57, maxHeight: 57, overflow: 'visible' }}>
        <View style={{ height: 56, minHeight: 56, maxHeight: 56, backgroundColor: colors.background }} />
      </View>
    ),
    [colors]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>

      <TopNavigation
        type="sub"
        title="결제 유형 설정"
        showLeftIcon
        onLeftIconPress={() => router.back()}
        showRightButton
        rightButtonText="생성"
        onRightButtonPress={() =>
          router.push({
            pathname: '/payment-type-create' as any,
            params: { type: selectedFilter },
          })
        }
      />

      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <View style={styles.chipRow}>
          <Chip
            label="신용카드"
            active={selectedFilter === 'credit'}
            onPress={() => setSelectedFilter('credit')}
          />
          <Chip
            label="체크카드"
            active={selectedFilter === 'debit'}
            onPress={() => setSelectedFilter('debit')}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.background }]}>
          {!isListDataReady ? (
            <View style={{ flex: 1 }} />
          ) : paymentTypes.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[typography.body01.regular, { color: colors.textAssistive }]}>
                등록된 결제 유형이 없습니다.
              </Text>
            </View>
          ) : (
            <DraggableFlatList
              data={paymentTypes}
              onDragBegin={(index: number) => handleDragStart({ index })}
              onPlaceholderIndexChange={handlePlaceholderIndexChange}
              onRelease={handleRelease}
              onDragEnd={handleDragEnd}
              animationConfig={{ damping: 50, stiffness: 1000, mass: 0.5, overshootClamping: true }}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              renderPlaceholder={renderPlaceholder}
              contentContainerStyle={styles.scrollContent}
              getItemLayout={(data, index) => ({
                length: 57,
                offset: 57 * index,
                index,
              })}
              removeClippedSubviews={false}
              autoscrollThreshold={isDragAutoscrollEnabled ? 56 : 0}
              autoscrollSpeed={isDragAutoscrollEnabled ? 48 : 0}
              onScrollOffsetChange={(offset: number) => {
                scrollOffsetYRef.current = offset;
              }}
              bounces={false}
              overScrollMode="never"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
