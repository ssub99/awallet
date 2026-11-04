/**
 * 간편입력 메인 · 체험하기 진입로 펼침 여부.
 * 미저장(최초) → 펼침. 사용자가 접기/펼치면 값을 유지한다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_KEY =
  '@awallet/quickInputTutorialEntryExpanded';

/** 최초(키 없음) 기본값 — 펼침 */
export const QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT = true;

export async function loadQuickInputTutorialEntryExpanded(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_KEY);
  if (raw === null) return QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT;
  }
}

export async function saveQuickInputTutorialEntryExpanded(
  expanded: boolean,
): Promise<void> {
  await AsyncStorage.setItem(
    QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_KEY,
    JSON.stringify(expanded),
  );
}
