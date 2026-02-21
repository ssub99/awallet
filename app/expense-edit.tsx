/**
 * Expense Edit Screen
 * 
 * Screen for editing existing expense records.
 * Uses the shared ExpenseRecordScreen component in edit mode.
 */

import { getExpenseById } from '@/utils/expenses';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import ExpenseRecordScreen from './expense-record';

export default function ExpenseEditScreen() {
  const { recordData } = useLocalSearchParams<{
    recordData?: string;
  }>();

  const [editData, setEditData] = useState<any>(() => {
    if (!recordData) {
      return null;
    }
    try {
      return JSON.parse(recordData);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;

    const hydrateLatestRecord = async () => {
      if (!recordData) {
        if (!cancelled) {
          setEditData(null);
        }
        return;
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(recordData);
      } catch {
        if (!cancelled) {
          setEditData(null);
        }
        return;
      }

      const lookupId =
        typeof parsed?.id === 'string'
          ? parsed.id
          : typeof parsed?.timestamp === 'number'
            ? parsed.timestamp.toString()
            : null;

      if (!lookupId) {
        if (!cancelled) {
          setEditData(parsed);
        }
        return;
      }

      try {
        const latest = await getExpenseById(lookupId);
        if (cancelled) {
          return;
        }
        if (latest) {
          // 타임라인 전달값(실제 인덱스 등) + 저장소 최신 상태(결산/환불/선결제 플래그) 병합
          setEditData({ ...parsed, ...latest });
          return;
        }
      } catch {
        // 조회 실패 시 전달 파라미터를 그대로 사용
      }

      if (!cancelled) {
        setEditData(parsed);
      }
    };

    hydrateLatestRecord();

    return () => {
      cancelled = true;
    };
  }, [recordData]);

  return <ExpenseRecordScreen mode="edit" editData={editData} />;
}