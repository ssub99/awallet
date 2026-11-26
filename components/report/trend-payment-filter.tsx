/**
 * 소비 현황 결제 유형 필터 — 선택 상태(저장 포함)와 바텀시트.
 * 챌린지 화면의 리포트 모드에서 동작·저장 키·분석 이벤트를 그대로 옮겼다.
 */

import { Icon } from '@/components/ui/icon';
import { ModalBottomsheet, ModalBottomsheetBottomInset } from '@/components/ui/modal-bottomsheet';
import { UiLineText } from '@/components/ui/ui-line-text';
import { typography, type ColorPalette } from '@/constants/theme';
import { logEvent } from '@/utils/analytics';
import { initializePaymentSubtypes, type PaymentSubtype } from '@/utils/payment-types';
import type { TrendItem } from '@/utils/report-trend';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const TREND_PAYMENT_FILTER_STORAGE_KEY = 'challengeTrendPaymentFilter_v1';
const STANDARD_TREND_PAYMENT_FILTER_KEYS = ['cash'] as const;

function buildAllTrendPaymentFilterKeyIds(subtypes: PaymentSubtype[]): string[] {
  return [...subtypes.map((item) => item.id), ...STANDARD_TREND_PAYMENT_FILTER_KEYS];
}

function mergeTrendPaymentFilterKeys(current: string[], idsToAdd: string[]): string[] {
  const merged = new Set(current);
  for (const id of idsToAdd) {
    merged.add(id);
  }
  return Array.from(merged);
}

export function useTrendPaymentFilter(items: TrendItem[]) {
  const [showSheet, setShowSheet] = useState(false);
  const [paymentSubtypes, setPaymentSubtypes] = useState<PaymentSubtype[]>([]);
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [draftKeys, setDraftKeys] = useState<string[]>([]);
  const [shouldInitDefaults, setShouldInitDefaults] = useState(false);
  const [shouldBackfillMissingOptions, setShouldBackfillMissingOptions] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const prevSubtypeIdsRef = useRef<string[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadSubtypes = async () => {
        try {
          const subtypes = await initializePaymentSubtypes();
          if (!active) return;
          setPaymentSubtypes(subtypes);
        } catch {
          // ignore
        }
      };
      void loadSubtypes();
      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    let active = true;
    const loadStoredFilter = async () => {
      try {
        const stored = await AsyncStorage.getItem(TREND_PAYMENT_FILTER_STORAGE_KEY);
        if (!active) return;
        if (!stored) {
          setShouldInitDefaults(true);
          return;
        }
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed) && parsed.every((key) => typeof key === 'string')) {
          const storedKeys = parsed as string[];
          if (storedKeys.length === 0) {
            setFilterKeys([]);
            setShouldInitDefaults(false);
          } else {
            setFilterKeys(storedKeys);
            setShouldInitDefaults(false);
            setShouldBackfillMissingOptions(true);
          }
          return;
        }
        setShouldInitDefaults(true);
      } catch {
        if (active) {
          setShouldInitDefaults(true);
        }
      } finally {
        if (active) {
          setIsLoaded(true);
        }
      }
    };
    void loadStoredFilter();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (shouldInitDefaults) return;
    void AsyncStorage.setItem(TREND_PAYMENT_FILTER_STORAGE_KEY, JSON.stringify(filterKeys)).catch(() => {
      // ignore
    });
  }, [isLoaded, shouldInitDefaults, filterKeys]);

  const creditSubtypes = useMemo(
    () => paymentSubtypes.filter((item) => item.type === 'credit'),
    [paymentSubtypes]
  );
  const debitSubtypes = useMemo(
    () => paymentSubtypes.filter((item) => item.type === 'debit'),
    [paymentSubtypes]
  );
  const options = useMemo(
    () => [
      ...creditSubtypes.map((item) => ({
        type: 'subtype' as const,
        id: item.id,
        label: item.label,
        description: item.description,
        color: item.color,
      })),
      ...debitSubtypes.map((item) => ({
        type: 'subtype' as const,
        id: item.id,
        label: item.label,
        description: item.description,
        color: item.color,
      })),
      { type: 'cash' as const, id: 'cash', label: '현금', description: '' },
    ],
    [creditSubtypes, debitSubtypes]
  );

  const validKeySet = useMemo(
    () => new Set(buildAllTrendPaymentFilterKeyIds(paymentSubtypes)),
    [paymentSubtypes],
  );

  useEffect(() => {
    if (!shouldInitDefaults) return;
    if (paymentSubtypes.length === 0) return;

    const allKeys = buildAllTrendPaymentFilterKeyIds(paymentSubtypes);
    setFilterKeys(allKeys);
    setDraftKeys(allKeys);
    setShouldInitDefaults(false);
    setShouldBackfillMissingOptions(false);
    prevSubtypeIdsRef.current = paymentSubtypes.map((item) => item.id);
  }, [paymentSubtypes, shouldInitDefaults]);

  useEffect(() => {
    if (!isLoaded || shouldInitDefaults) return;
    if (!shouldBackfillMissingOptions) return;
    if (paymentSubtypes.length === 0) return;

    const allKeys = buildAllTrendPaymentFilterKeyIds(paymentSubtypes);
    setFilterKeys((prev) => {
      const missingIds = allKeys.filter((id) => !prev.includes(id));
      return missingIds.length > 0 ? mergeTrendPaymentFilterKeys(prev, missingIds) : prev;
    });
    setDraftKeys((prev) => {
      const missingIds = allKeys.filter((id) => !prev.includes(id));
      return missingIds.length > 0 ? mergeTrendPaymentFilterKeys(prev, missingIds) : prev;
    });
    setShouldBackfillMissingOptions(false);
    prevSubtypeIdsRef.current = paymentSubtypes.map((item) => item.id);
  }, [isLoaded, paymentSubtypes, shouldBackfillMissingOptions, shouldInitDefaults]);

  useEffect(() => {
    if (!isLoaded) return;
    if (paymentSubtypes.length === 0) return;

    setFilterKeys((prev) => prev.filter((key) => validKeySet.has(key)));
    setDraftKeys((prev) => prev.filter((key) => validKeySet.has(key)));
  }, [isLoaded, paymentSubtypes.length, validKeySet]);

  useEffect(() => {
    if (!isLoaded || shouldInitDefaults) return;

    const subtypeIds = paymentSubtypes.map((item) => item.id);
    const prevSubtypeIds = prevSubtypeIdsRef.current;
    prevSubtypeIdsRef.current = subtypeIds;

    if (prevSubtypeIds === null) return;

    const addedSubtypeIds = subtypeIds.filter((id) => !prevSubtypeIds.includes(id));
    if (addedSubtypeIds.length === 0) return;

    setFilterKeys((prev) => mergeTrendPaymentFilterKeys(prev, addedSubtypeIds));
    setDraftKeys((prev) => mergeTrendPaymentFilterKeys(prev, addedSubtypeIds));
  }, [isLoaded, paymentSubtypes, shouldInitDefaults]);

  const defaultCreditSubtypeId = creditSubtypes[0]?.id;
  const defaultDebitSubtypeId = debitSubtypes[0]?.id;
  const filteredItems = useMemo(() => {
    if (filterKeys.length === 0) return [];
    const selectedKeySet = new Set(filterKeys);
    return items.filter((item) => {
      if (item.paymentMethod === 'cash') return selectedKeySet.has('cash');
      const resolvedSubtypeId =
        item.paymentSubtypeId ??
        (item.paymentMethod === 'debit' ? defaultDebitSubtypeId : defaultCreditSubtypeId);
      return typeof resolvedSubtypeId === 'string' ? selectedKeySet.has(resolvedSubtypeId) : false;
    });
  }, [defaultCreditSubtypeId, defaultDebitSubtypeId, filterKeys, items]);

  const open = useCallback(() => {
    void logEvent('btn', {
      screen_name: '/report',
      target: 'filter',
    });
    void logEvent('sheet_view', {
      screen_name: '/report',
      target: 'filter',
    });
    setDraftKeys(filterKeys);
    setShowSheet(true);
  }, [filterKeys]);

  const close = useCallback(() => {
    void logEvent('btn', {
      screen_name: '/report',
      target: 'filter-close',
    });
    setDraftKeys(filterKeys);
    setShowSheet(false);
  }, [filterKeys]);

  const confirm = useCallback(() => {
    void logEvent('btn', {
      screen_name: '/report',
      target: 'filter-confirm',
    });
    setFilterKeys(draftKeys);
    setShowSheet(false);
  }, [draftKeys]);

  const toggle = useCallback((itemId: string) => {
    void logEvent('list', {
      screen_name: '/report',
      target: 'filter',
    });
    setDraftKeys((prev) =>
      prev.includes(itemId) ? prev.filter((key) => key !== itemId) : [...prev, itemId]
    );
  }, []);

  return {
    filteredItems,
    isApplied: filterKeys.length > 0,
    open,
    sheetProps: { visible: showSheet, options, draftKeys, onClose: close, onConfirm: confirm, onToggle: toggle },
  };
}

type TrendPaymentFilterSheetProps = ReturnType<typeof useTrendPaymentFilter>['sheetProps'] & {
  palette: ColorPalette;
};

export function TrendPaymentFilterSheet({
  visible,
  options,
  draftKeys,
  onClose,
  onConfirm,
  onToggle,
  palette,
}: TrendPaymentFilterSheetProps) {
  const { height: windowHeight } = useWindowDimensions();

  return (
    <ModalBottomsheet
      visible={visible}
      title="필터"
      onClose={onClose}
      onConfirm={onConfirm}
      confirmText="확인"
      closeOnBackdrop={true}
      style={{ height: windowHeight * 0.8 }}
      contentStyle={styles.sheetContent}
      noPaddingBottom={true}
      resizable
    >
      <View style={[styles.sheetBody, { backgroundColor: palette.fill }]}>
        <View style={[styles.listCard, { backgroundColor: palette.staticWhite }]}>
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listScrollContent}
            showsVerticalScrollIndicator={true}
            bounces={false}
            overScrollMode="never"
          >
            {options.map((item, index) => {
              const isSelected = draftKeys.includes(item.id);
              return (
                <View key={item.id}>
                  <Pressable style={styles.item} onPress={() => onToggle(item.id)}>
                    {item.type === 'cash' ? (
                      <View style={styles.emojiWrap}>
                        <UiLineText style={styles.cashEmoji}>💰</UiLineText>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.indicator,
                          { backgroundColor: item.color, borderColor: palette.border },
                        ]}
                      />
                    )}
                    <View
                      style={[
                        styles.textBlock,
                        !item.description.trim() && styles.textBlockSingleLine,
                      ]}
                    >
                      <UiLineText style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                        {item.label}
                      </UiLineText>
                      {item.description.trim() ? (
                        <Text
                          style={[styles.subtitle, { color: palette.textAssistive }]}
                          numberOfLines={1}
                        >
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <View style={styles.checkWrap}>
                        <Icon name="check" variant="line" size={24} color={palette.primary} />
                      </View>
                    ) : null}
                  </Pressable>
                  {index < options.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: palette.border }]} />
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
        <ModalBottomsheetBottomInset backgroundColor={palette.staticWhite} />
      </View>
    </ModalBottomsheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    padding: 0,
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'column',
  },
  listCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    flexGrow: 1,
  },
  item: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  emojiWrap: {
    width: 16,
    alignItems: 'center',
  },
  cashEmoji: {
    
  },
  indicator: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  textBlock: {
    marginLeft: 12,
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  textBlockSingleLine: {
    justifyContent: 'center',
  },
  title: {
    
  },
  subtitle: {
    ...typography.body02.regular,
  },
  checkWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
});
