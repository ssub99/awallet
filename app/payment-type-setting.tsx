import { TopNavigation } from '@/components/navigation/top-navigation';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Tag } from '@/components/ui/tag';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import {
    DEFAULT_PAYMENT_SUBTYPES,
    initializePaymentSubtypes,
    savePaymentSubtypes,
    type PaymentSubtype,
} from '@/utils/payment-types';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
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
  content: { flex: 1, padding: 16 },
  card: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  scrollContent: { paddingBottom: 0 },
  handleArea: { padding: 8, margin: -8 },
  rowWrap: { height: 57, minHeight: 57, maxHeight: 57, overflow: 'visible' },
  rowInnerWrap: { height: 56, minHeight: 56, maxHeight: 56, justifyContent: 'center' },
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
  paymentTypeTitle: { ...Typography.body1.l.regular },
  paymentTypeSubtitle: { ...Typography.body2.r.regular },
  paymentTypeRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  divider: { height: 1, marginLeft: 16, marginRight: 16 },
});

function PaymentTypeItem({
  item,
  drag,
  isActive,
  index,
  colors,
  onDragStart,
  showDivider,
  onPress,
}: {
  item: PaymentTypeItemData;
  drag: () => void;
  isActive: boolean;
  index: number | undefined;
  colors: typeof ThemeColors.light;
  onDragStart: (params: { index: number }) => void;
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
          <Animated.View style={[{ backgroundColor: colors.background }, isActive && styles.paymentTypeRowActive, animatedShadowStyle]}>
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
                  <Text style={[styles.paymentTypeTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
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
                    if (index !== undefined) onDragStart({ index });
                    drag();
                  }}
                  onLongPress={drag}
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
  const colors = ThemeColors.light;
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<PaymentMethodType>('credit');
  const [paymentSubtypes, setPaymentSubtypes] = useState<PaymentSubtype[]>([]);

  const previousIndexRef = useRef<number | null>(null);
  const hasTriggeredStartHapticRef = useRef<boolean>(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastDragEndTimeRef = useRef<number>(0);

  const loadPaymentTypesData = useCallback(async () => {
    try {
      const loaded = await initializePaymentSubtypes();
      setPaymentSubtypes(loaded);
    } catch (error) {
      console.error('결제 유형 초기화 실패:', error);
      setPaymentSubtypes(DEFAULT_PAYMENT_SUBTYPES);
    } finally {
      previousIndexRef.current = null;
      hasTriggeredStartHapticRef.current = false;
      dragStartIndexRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadPaymentTypesData();
  }, [loadPaymentTypesData]);

  useFocusEffect(
    useCallback(() => {
      void loadPaymentTypesData();
    }, [loadPaymentTypesData])
  );

  const paymentTypes = useMemo(() => {
    const filtered = paymentSubtypes.filter((item) => item.type === selectedFilter);
    return filtered.map((item, index) => toSettingItem(item, index === 0));
  }, [paymentSubtypes, selectedFilter]);

  const handleDragStart = useCallback(({ index }: { index: number }) => {
    if (!hasTriggeredStartHapticRef.current) {
      isDraggingRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      hasTriggeredStartHapticRef.current = true;
      dragStartIndexRef.current = index;
      previousIndexRef.current = index;
    }
  }, []);

  const handlePlaceholderIndexChange = useCallback((index: number) => {
    if (previousIndexRef.current !== null && previousIndexRef.current !== index) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    previousIndexRef.current = index;
  }, []);

  const handleDragEnd = useCallback(
    ({ data }: { data: PaymentTypeItemData[] }) => {
      lastDragEndTimeRef.current = Date.now();
      isDraggingRef.current = false;
      previousIndexRef.current = null;
      hasTriggeredStartHapticRef.current = false;
      dragStartIndexRef.current = null;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
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
        });
      });
    },
    [paymentSubtypes, selectedFilter]
  );

  const handlePaymentTypePress = useCallback(
    (item: PaymentTypeItemData) => {
      router.push({
        pathname: '/payment-type-edit' as any,
        params: { id: item.id },
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
          index={index}
          colors={colors}
          onDragStart={handleDragStart}
          showDivider={!isLast && !isActive}
          onPress={handlePaymentTypePress}
        />
      );
    },
    [colors, handleDragStart, handlePaymentTypePress, paymentTypes.length]
  );

  const renderPlaceholder = useCallback(
    () => (
      <View style={{ height: 57, minHeight: 57, maxHeight: 57, overflow: 'hidden' }}>
        <View style={{ height: 56, minHeight: 56, maxHeight: 56, backgroundColor: colors.background }} />
      </View>
    ),
    [colors]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" />

      <TopNavigation
        type="sub"
        title="결제 유형 설정"
        showLeftIcon
        onLeftIconPress={() => router.back()}
        showRightButton
        rightButtonText="생성"
        onRightButtonPress={() => router.push('/payment-type-create' as any)}
      />

      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <View style={styles.chipRow}>
          <Chip label="신용카드" active={selectedFilter === 'credit'} onPress={() => setSelectedFilter('credit')} />
          <Chip label="체크카드" active={selectedFilter === 'debit'} onPress={() => setSelectedFilter('debit')} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.background }]}>
          {paymentTypes.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[Typography.body1.l.regular, { color: colors.textAssistive }]}>
                등록된 결제 유형이 없습니다.
              </Text>
            </View>
          ) : (
            <DraggableFlatList
              data={paymentTypes}
              onDragBegin={(index: number) => handleDragStart({ index })}
              onPlaceholderIndexChange={handlePlaceholderIndexChange}
              onRelease={() => {}}
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
