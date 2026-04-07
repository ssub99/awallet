import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY } from '@/constants/app-store';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';
import { getReviewPromptLifetimeRecordCount } from '@/utils/app-store-review-lifetime';

/**
 * 한 기기(AsyncStorage) 기준으로 인앱 스토어 리뷰 요청을 1회 시도한 뒤 재시도하지 않음.
 * (iOS StoreKit / Android Play In-App Review — 실제 표시 여부는 OS 정책에 따름)
 */

const RECORD_THRESHOLD = 10;

/** 동시에 maybePrompt가 두 번 돌지 않도록 (스케줄러는 별도로 setTimeout으로 합침) */
let reviewPromptRunInFlight = false;

/**
 * 소비·입금 "생성" 누적 건수(삭제해도 유지)가 RECORD_THRESHOLD 이상이면,
 * 아직 시도한 적 없을 때 네이티브 인앱 리뷰 요청을 호출합니다.
 */
export async function maybePromptWriteReviewIfEligible(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  if (reviewPromptRunInFlight) {
    return;
  }
  reviewPromptRunInFlight = true;

  try {
    const already = await AsyncStorage.getItem(APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY);
    if (already === 'true') {
      return;
    }

    const total = await getReviewPromptLifetimeRecordCount();
    if (total < RECORD_THRESHOLD) {
      return;
    }

    // hasAction()은 storeUrl만 있어도 true라, TestFlight(iOS)에서 인앱 리뷰가 막혀 있어도
    // requestReview 직후 플래그까지 저장되는 경우가 생길 수 있음 → 정식 빌드에서도 영구 스킵 위험.
    const nativeAvailable = await StoreReview.isAvailableAsync();
    if (!nativeAvailable) {
      return;
    }

    await StoreReview.requestReview();
    await AsyncStorage.setItem(APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY, 'true');
  } catch {
    // 리뷰 API 실패는 기록 저장 UX에 영향 주지 않음
  } finally {
    reviewPromptRunInFlight = false;
  }
}
