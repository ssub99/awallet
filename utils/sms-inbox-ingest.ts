/**
 * 단축어/딥링크 → (선택) allowlist → parse → store.
 *
 * 발신 필터 1차: iOS 메시지 자동화 트리거.
 * 발신 필터 2차: 앱 수신번호 allowlist — sender가 넘어온 경우에만.
 * sender가 비어 있으면 자동화 필터를 신뢰하고 본문만으로 적재한다.
 */

import {
  isSenderAllowed,
  normalizeSmsSender,
  parseSmsInboxBody,
  restoreSmsSenderFromQueryParam,
} from '@/utils/sms-inbox-parse';
import { Platform } from 'react-native';

import {
  ingestParsedSms,
  normalizeSmsOriginalBody,
  type SmsInboxIngestResult,
} from '@/utils/sms-inbox-store';
import { loadSmsReceiveEnabled, loadSmsReceiveNumbers } from '@/utils/sms-receive-settings';

export type SmsInboxIngestInput = {
  body: string;
  sender: string;
};

export type SmsInboxIngestGateResult =
  | SmsInboxIngestResult
  | { ok: false; reason: string };

export async function ingestSmsInboxMessage(
  input: SmsInboxIngestInput,
): Promise<SmsInboxIngestGateResult> {
  // 중간 줄바꿈은 유지. 앞·뒤 빈 줄만 정리.
  const body = normalizeSmsOriginalBody(input.body);
  const sender = input.sender.trim();
  const bodyPreview = body.replace(/\s+/g, ' ').trim().slice(0, 48);
  const logGate = (reason: string, extra?: Record<string, unknown>) => {
    if (Platform.OS !== 'android') return;
    console.warn(
      '[SmsInbox][android] ingest',
      JSON.stringify({
        reason,
        sender,
        senderNorm: normalizeSmsSender(sender),
        bodyPreview: bodyPreview.length > 0 ? `${bodyPreview}${body.length > 48 ? '…' : ''}` : '',
        ...extra,
      }),
    );
  };

  if (!body) {
    logGate('empty-body');
    return { ok: false, reason: 'empty-body' };
  }

  const enabled = await loadSmsReceiveEnabled();
  if (!enabled) {
    logGate('disabled');
    return { ok: false, reason: 'disabled' };
  }

  const allowlist = await loadSmsReceiveNumbers();
  if (allowlist.length === 0) {
    logGate('empty-allowlist');
    return { ok: false, reason: 'empty-allowlist' };
  }
  // sender가 숫자로 해석될 때만 allowlist 재검증.
  // iOS 단축어가 보낸 사람을 이름/라벨로 넘기는 케이스는 1차 트리거를 신뢰한다.
  const normalizedSender = normalizeSmsSender(sender);
  if (normalizedSender && !isSenderAllowed(sender, allowlist)) {
    logGate('sender-not-allowed', {
      allowlist,
      allowlistNorm: allowlist.map(normalizeSmsSender),
    });
    return { ok: false, reason: 'sender-not-allowed' };
  }

  const parsed = parseSmsInboxBody(body);
  if (parsed.kind === 'ignore') {
    logGate(parsed.reason, { parseKind: 'ignore' });
    return { ok: false, reason: parsed.reason };
  }

  const result = await ingestParsedSms({ sender, body, parsed });
  logGate(`ok:${result.action}`, {
    parseKind: parsed.kind,
    allowlistNorm: allowlist.map(normalizeSmsSender),
  });
  return result;
}

export { restoreSmsSenderFromQueryParam };

/** `awallet://sms-inbox?body=&sender=` */
export function parseSmsInboxDeepLink(url: string): SmsInboxIngestInput | null {
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

export async function ingestSmsInboxDeepLinkUrl(url: string): Promise<SmsInboxIngestGateResult> {
  const payload = parseSmsInboxDeepLink(url);
  if (!payload) {
    return { ok: false, reason: 'not-sms-inbox-url' };
  }
  return ingestSmsInboxMessage(payload);
}
