/**
 * 단축어/딥링크 → (선택) allowlist → parse → store.
 *
 * 발신 필터 1차: iOS 메시지 자동화 트리거.
 * 발신 필터 2차: 앱 수신번호 allowlist — sender가 넘어온 경우에만.
 * sender가 비어 있으면 자동화 필터를 신뢰하고 본문만으로 적재한다.
 * source가 'app'(iOS 알림 수신함 Intent · Android 알림 수신 대상 앱)이면 앱 알림 수신 ON만 확인한다.
 */

import {
  isSenderAllowed,
  normalizeSmsSender,
  parseRecordInboxBody,
  restoreSmsSenderFromQueryParam,
} from '@/utils/record-inbox-parse';

import {
  ingestParsedRecordInbox,
  normalizeRecordInboxOriginalBody,
  type RecordInboxIngestResult,
} from '@/utils/record-inbox-store';
import {
  loadAppNotificationReceiveEnabled,
  loadSmsReceiveEnabled,
  loadSmsReceiveNumbers,
} from '@/utils/record-inbox-receive-settings';

export type RecordInboxIngestInput = {
  body: string;
  sender: string;
  /** 'app' = 앱 알림(iOS Intent · Android 리스너). 생략 시 문자 */
  source?: 'sms' | 'app';
};

export type RecordInboxIngestGateResult =
  | RecordInboxIngestResult
  | { ok: false; reason: string };

export async function ingestRecordInboxMessage(
  input: RecordInboxIngestInput,
): Promise<RecordInboxIngestGateResult> {
  // 중간 줄바꿈은 유지. 앞·뒤 빈 줄만 정리.
  const body = normalizeRecordInboxOriginalBody(input.body);
  const sender = input.sender.trim();

  if (!body) {
    return { ok: false, reason: 'empty-body' };
  }

  // 앱 알림: 단축어/알림 수신 대상에서 고른 앱이 1차 필터 → 수신번호 allowlist 미사용
  if (input.source === 'app') {
    if (!(await loadAppNotificationReceiveEnabled())) {
      return { ok: false, reason: 'disabled' };
    }
    const parsedApp = parseRecordInboxBody(body);
    if (parsedApp.kind === 'ignore') {
      return { ok: false, reason: parsedApp.reason };
    }
    return ingestParsedRecordInbox({ sender: sender || '앱 알림', body, parsed: parsedApp });
  }

  const enabled = await loadSmsReceiveEnabled();
  if (!enabled) {
    return { ok: false, reason: 'disabled' };
  }

  const allowlist = await loadSmsReceiveNumbers();
  if (allowlist.length === 0) {
    return { ok: false, reason: 'empty-allowlist' };
  }
  // sender가 숫자로 해석될 때만 allowlist 재검증.
  // iOS 단축어가 보낸 사람을 이름/라벨로 넘기는 케이스는 1차 트리거를 신뢰한다.
  const normalizedSender = normalizeSmsSender(sender);
  if (normalizedSender && !isSenderAllowed(sender, allowlist)) {
    return { ok: false, reason: 'sender-not-allowed' };
  }

  const parsed = parseRecordInboxBody(body);
  if (parsed.kind === 'ignore') {
    return { ok: false, reason: parsed.reason };
  }

  return ingestParsedRecordInbox({ sender, body, parsed });
}

export { restoreSmsSenderFromQueryParam };

/** `awallet://sms-inbox?body=&sender=` */
export function parseRecordInboxDeepLink(url: string): RecordInboxIngestInput | null {
  try {
    const normalized = url.trim();
    if (!normalized) return null;

    // awallet://sms-inbox?... | awallet:///sms-inbox?... | exp+...
    const match = normalized.match(/(?:^|[^\w])sms-inbox(?:\?|#|$)/i);
    if (!match) return null;

    const queryIndex = normalized.indexOf('?');
    if (queryIndex < 0) {
      return { body: '', sender: '' };
    }
    const query = normalized.slice(queryIndex + 1).split('#')[0] ?? '';
    const params = new URLSearchParams(query);
    const body = params.get('body') ?? params.get('text') ?? '';
    const sender = restoreSmsSenderFromQueryParam(
      params.get('sender') ?? params.get('from') ?? '',
    );
    return { body, sender };
  } catch {
    return null;
  }
}

export async function ingestRecordInboxDeepLinkUrl(url: string): Promise<RecordInboxIngestGateResult> {
  const payload = parseRecordInboxDeepLink(url);
  if (!payload) {
    return { ok: false, reason: 'not-sms-inbox-url' };
  }
  return ingestRecordInboxMessage(payload);
}
