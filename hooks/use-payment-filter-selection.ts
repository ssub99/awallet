/**
 * 결제 유형 필터의 선택 상태(저장 포함). 리포트 소비 현황과 월 타임라인이 함께 쓴다.
 */

import { initializePaymentSubtypes, type PaymentSubtype } from '@/utils/payment-types';
import {
  getKnownOptionsStorageKey,
  parseStoredKeys,
  reconcilePaymentFilter,
  type PaymentFilterSelection,
} from '@/utils/payment-filter-selection';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

interface UsePaymentFilterSelectionOptions {
  storageKey: string;
  /** 결제 유형(카드) 외에 항상 있는 항목. 렌더마다 같은 배열이어야 한다 */
  standardKeys: readonly string[];
  /** 예전 저장 키 — 있으면 `storageKey`로 옮긴다 */
  legacyStorageKey?: string;
}

export function usePaymentFilterSelection({
  storageKey,
  standardKeys,
  legacyStorageKey,
}: UsePaymentFilterSelectionOptions) {
  const [paymentSubtypes, setPaymentSubtypes] = useState<PaymentSubtype[]>([]);
  /** null: 저장소를 아직 읽지 않음 */
  const [selection, setSelection] = useState<PaymentFilterSelection | null>(null);
  const [draftKeys, setDraftKeys] = useState<string[]>([]);

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
    const loadSelection = async () => {
      let next: PaymentFilterSelection = { selected: null, known: null };
      try {
        let stored = await AsyncStorage.getItem(storageKey);
        if (!stored && legacyStorageKey) {
          stored = await AsyncStorage.getItem(legacyStorageKey);
          if (stored) {
            await AsyncStorage.setItem(storageKey, stored);
            await AsyncStorage.removeItem(legacyStorageKey);
          }
        }
        const known = await AsyncStorage.getItem(getKnownOptionsStorageKey(storageKey));
        next = { selected: parseStoredKeys(stored), known: parseStoredKeys(known) };
      } catch {
        // 읽기 실패 시 전체 선택
      }
      if (!active) return;
      setSelection(next);
      setDraftKeys(next.selected ?? []);
    };
    void loadSelection();
    return () => {
      active = false;
    };
  }, [storageKey, legacyStorageKey]);

  // 저장값을 현재 결제 유형 목록에 맞춘다 (effect가 아니라 렌더 중 상태 조정)
  if (selection !== null && paymentSubtypes.length > 0) {
    const reconciled = reconcilePaymentFilter(selection, [
      ...paymentSubtypes.map((item) => item.id),
      ...standardKeys,
    ]);
    if (reconciled !== selection) {
      setSelection(reconciled);
      setDraftKeys(reconciled.selected ?? []);
    }
  }

  useEffect(() => {
    if (selection?.selected == null) return;
    const writes = [AsyncStorage.setItem(storageKey, JSON.stringify(selection.selected))];
    if (selection.known !== null) {
      writes.push(
        AsyncStorage.setItem(
          getKnownOptionsStorageKey(storageKey),
          JSON.stringify(selection.known),
        ),
      );
    }
    void Promise.all(writes).catch(() => {
      // ignore
    });
  }, [selection, storageKey]);

  const setFilterKeys = useCallback((keys: string[]) => {
    setSelection((prev) => (prev === null ? prev : { ...prev, selected: keys }));
  }, []);

  return {
    paymentSubtypes,
    filterKeys: selection?.selected ?? EMPTY_KEYS,
    setFilterKeys,
    draftKeys,
    setDraftKeys,
  };
}

const EMPTY_KEYS: string[] = [];
