/**
 * label → emoji 맵.
 * 복원·카테고리 편집 후 AppData `dataVersion`이 오르면 다시 로드한다.
 * (마운트 1회만 읽으면 복원 직후 커스텀 카테고리가 기타(📝)로 보이는 원인)
 */

import { useAppData } from '@/contexts/app-data-context';
import { loadCategories } from '@/utils/categories';
import { useEffect, useState } from 'react';

export function useCategoryEmojiMap(): Record<string, string> {
  const { dataVersion } = useAppData();
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCategories('expense', { forceStorage: true }),
      loadCategories('income', { forceStorage: true }),
    ])
      .then(([expense, income]) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const category of [...expense, ...income]) {
          next[category.label] = category.emoji;
        }
        setMap(next);
      })
      .catch(() => {
        if (!cancelled) {
          setMap({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  return map;
}
