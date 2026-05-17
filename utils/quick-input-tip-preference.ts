/**
 * 간편입력 롱버전 TIP 박스 접힘/펼침 상태
 *
 * - 키 없음(최초 설치) → 펼침
 * - 전체 초기화·백업 복원 시 키 제거 → 펼침
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUICK_INPUT_TIP_BOX_EXPANDED_KEY = 'quickInputTipBoxExpanded';

export async function loadQuickInputTipBoxExpanded(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(QUICK_INPUT_TIP_BOX_EXPANDED_KEY);
  if (raw === null) {
    return true;
  }
  return raw === 'true';
}

export async function saveQuickInputTipBoxExpanded(expanded: boolean): Promise<void> {
  await AsyncStorage.setItem(QUICK_INPUT_TIP_BOX_EXPANDED_KEY, expanded ? 'true' : 'false');
}

export async function clearQuickInputTipBoxExpanded(): Promise<void> {
  await AsyncStorage.removeItem(QUICK_INPUT_TIP_BOX_EXPANDED_KEY);
}
