/**
 * 에이전트: 사용자 메시지 → 지출 기록 제안 (Gemini API)
 * POST body: { message: string, history?: { role, content }[], categories?: string[], today?: string }
 *   - categories: 해당 사용자의 카테고리 목록(라벨만). 없으면 [].
 *   - today: 기준일 YYYY.MM.DD. 없으면 서버일자 사용.
 * Response: { records, suggestedCategory?, reply? }
 */

import { refineMemoWithGemini } from './refine-expense-memo';
import { buildMemoRefinementPlan } from '../utils/parse-expense-memo';
import {
  resolveExpenseSeriesStartDateFromMessage,
  resolveRelativeWeekdayDateFromMessage,
} from '../utils/parse-expense-relative-date';
import { resolveExpenseRecurringTypeFromMessage } from '../utils/expense-calculations';
import { resolveHolidayDateFromMessage } from './holiday-calendar';
import { getBaseSystemPrompt } from './ai-system-prompts';
import {
  checkRateLimit,
  DEFAULT_AI_RATE_LIMIT_POLICY,
  recordRateLimitSuccess,
  verifyInternalApiSecret,
} from './_security';

const PAYMENT_METHODS = ['credit', 'debit', 'cash'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];
type PaymentSubtypeType = Exclude<PaymentMethod, 'cash'>;

interface PaymentSubtypeOption {
  type: PaymentSubtypeType;
  label: string;
}

interface ExpenseRecordSuggestion {
  recordType?: 'expense' | 'income';
  category: string;
  date: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  paymentSubtypeLabel?: string;
  memo?: string;
  /** 정기 기록 여부. 할부와 동시에 true 불가 */
  isRecurring?: boolean;
  /** 할부 기록 여부. 정기와 동시에 true 불가 */
  isInstallment?: boolean;
  /** 정기: 매일, 매주, 2주, 3주, 4주, 매월, 2개월 마다, 3개월 마다, 4개월 마다, 5개월 마다, 6개월 마다, 주중, 주말. 할부: 무시 */
  recurringType?: string;
  /** 정기: 해당 년도 내 반복 개월 수. 할부: 할부 개월 수(2~12) */
  totalMonths?: number;
  /** weekend=관계없이 주말, friday=금주 금요일, monday=차주 월요일. 매일/주중/주말 반복 시 무시 */
  weekendOption?: 'weekend' | 'friday' | 'monday';
}

interface SuggestedCategory {
  label: string;
  emoji: string;
}

interface ParseExpenseResponse {
  records: ExpenseRecordSuggestion[];
  suggestedCategory?: SuggestedCategory | null;
  reply?: string | null;
}

const MAX_HISTORY_MESSAGES = 6;

/** 기본 모델. Vercel env `awallet_gemini_model` 로 덮어쓰기 가능 (테스트: flash-lite) */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

function resolveGeminiModel(): string {
  const fromEnv = process.env.awallet_gemini_model ?? process.env.AWALLET_GEMINI_MODEL;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

function buildExpenseSystemPrompt(
  categories: string[],
  today: string,
  paymentSubtypeOptions: PaymentSubtypeOption[],
): string {
  const base = getBaseSystemPrompt();
  const categoryList =
    categories.length > 0 ? categories.join(', ') : '(없음. suggestedCategory로만 제안)';
  const creditSubtypeLabels = paymentSubtypeOptions
    .filter((item) => item.type === 'credit')
    .map((item) => item.label);
  const debitSubtypeLabels = paymentSubtypeOptions
    .filter((item) => item.type === 'debit')
    .map((item) => item.label);
  const paymentSubtypeGuide =
    paymentSubtypeOptions.length > 0
      ? `신용 결제유형: ${creditSubtypeLabels.join(', ') || '(없음)'}\n체크 결제유형: ${debitSubtypeLabels.join(', ') || '(없음)'}`
      : '결제유형 목록: (없음)';

  return `${base}

가계부 지출 추출 에이전트입니다. JSON만 출력해야 합니다.

규칙:
1. 요청 없으면 생성/삭제 금지.
1-1. 수입 키워드(월급/급여/보너스/입금/용돈/환급/꽁돈)면 recordType을 income으로 설정.
2. 결제 기본: credit. 체크/현금 요청 시 debit/cash. 기본값 지정 요청 시 기억.
2-1. 사용자가 카드사/카드명(예: 신한카드)을 언급하면 paymentSubtypeLabel에 해당 결제유형 라벨을 넣음.
2-2. paymentMethod가 cash면 paymentSubtypeLabel은 반드시 빈 값(생략).
3. 날짜는 기준일 ${today} 기준. YYYY.MM.DD. (저번주/이번주/다음주+요일 조합은 서버에서 월요일 시작 주로 재계산해 보정될 수 있음)
4. 소비 외 질문→reply에 "소비 기록 관련해서만 답변드릴 수 있어요."
5. 부족한 항목 있으면 reply에 요청. 카테고리 목록에 없거나 비어있으면 반드시 suggestedCategory 1개 제안(이모지+이름 10자).
6. 메모는 사용자가 별도로 요청할 때만 기록에 넣음. 자연어로 메모를 요청한 경우(메모도 넣어줘·메모 남겨 등) memo는 비우거나 짧은 초안만 넣음(서버에서 재정제).

카테고리: ${categoryList}
${paymentSubtypeGuide}
- 목록이 비어있거나 매칭 없으면 records[].category는 null, suggestedCategory는 반드시 채움(예: 옷→쇼핑).
금액: 숫자만. 2만원→20000. paymentMethod: 신용/카드→credit, 체크/현금→debit/cash. 여러 건이면 records에 복수.
recordType이 income이면 paymentMethod/paymentSubtypeLabel은 비움.
수입은 반복 기록 미지원: recordType이 income이면 isRecurring/isInstallment를 넣지 않음.

반복/할부: **반드시** 사용자 메시지에서 정기(월세·구독·정기결제·매달·매월) 또는 할부(3개월 할부 등) 의도가 있으면 해당 필드를 채움.
- 구독/매달/매월/월세/정기결제 → isRecurring: true, recurringType: "매월", totalMonths: 12, weekendOption: "weekend"
- 주중/평일/주말 + 반복 표현(씩/마다 등) → isRecurring: true, recurringType: "주중" 또는 "주말"
- 할부 N개월 → isInstallment: true, totalMonths: N(2~12), weekendOption: "weekend"
- 올해초부터/올해 N월부터/저번달부터 등은 반복·할부 지출의 시작일.
- 일반 지출 → isRecurring, isInstallment 모두 생략 또는 false
- recurringType: 매일|매주|2주|3주|4주|매월|2개월 마다|3개월 마다|4개월 마다|5개월 마다|6개월 마다|주중|주말. 매달/매월/월세/구독이면 "매월".
- totalMonths: 정기 매월이면 12. 할부면 개월수.
- weekendOption: "weekend"|"friday"|"monday". 기본 "weekend". 주말 날짜+금요일 기록 원하면 "friday".

예: "티빙 구독 8천원 매달" → {"category":"구독 서비스","date":"오늘","amount":8000,"isRecurring":true,"recurringType":"매월","totalMonths":12,"weekendOption":"weekend"}

JSON 형식: {"records":[{"recordType","category","date","amount","paymentMethod","paymentSubtypeLabel","memo","isRecurring","isInstallment","recurringType","totalMonths","weekendOption"}],"suggestedCategory":null 또는 {"label","emoji"},"reply":null}
reply는 사용자에게 할 말(부족한 항목 안내·거절 멘트 등) 있을 때만 문자열, 없으면 null.
`;
}

function buildExpenseUserPrompt(
  message: string,
  history: { role: string; content: string }[]
): string {
  const limited = history.slice(-MAX_HISTORY_MESSAGES);
  const historyText =
    limited.length > 0
      ? limited.map((h) => `${h.role === 'user' ? '사용자' : 'AI'}: ${h.content}`).join('\n')
      : '';
  const context = historyText ? `이전 대화:\n${historyText}\n\n현재 입력: ${message}` : message;

  return context;
}

const CATEGORY_LABEL_MAX_LEN = 10;

function normalizeSuggestedCategory(
  raw: unknown
): { label: string; emoji: string } | null {
  if (raw == null) return null;
  if (
    typeof raw === 'object' &&
    'label' in (raw as object) &&
    'emoji' in (raw as object)
  ) {
    const o = raw as { label?: unknown; emoji?: unknown };
    const label = String(o.label ?? '').trim().slice(0, CATEGORY_LABEL_MAX_LEN);
    const emoji = String(o.emoji ?? '').trim();
    if (label && emoji) return { label, emoji };
    return null;
  }
  const str =
    typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null;
  if (typeof str !== 'string' || !str.trim()) return null;
  const trimmed = str.trim();
  const firstSpace = trimmed.indexOf(' ');
  const hasEmojiPart = firstSpace > 0;
  const emoji = hasEmojiPart ? trimmed.slice(0, firstSpace).trim() : '📁';
  const label = (hasEmojiPart ? trimmed.slice(firstSpace) : trimmed)
    .trim()
    .slice(0, CATEGORY_LABEL_MAX_LEN);
  if (!label) return null;
  return { label, emoji: emoji || '📁' };
}

function toBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === 'true') return true;
  if (v === 1) return true;
  return false;
}

function toNum(v: unknown, def: number): number {
  if (typeof v === 'number' && !isNaN(v)) return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!isNaN(n)) return n;
  }
  return def;
}

function normalizeRecord(raw: Record<string, unknown>): ExpenseRecordSuggestion {
  const isRecurring = toBool(raw.isRecurring);
  const isInstallment = toBool(raw.isInstallment);
  const recurringType = typeof raw.recurringType === 'string' ? raw.recurringType : undefined;
  const totalMonths = toNum(raw.totalMonths, isRecurring ? 12 : isInstallment ? 3 : 1);
  const wo = raw.weekendOption;
  const weekendOption =
    wo === 'weekend' || wo === 'friday' || wo === 'monday' ? (wo as 'weekend' | 'friday' | 'monday') : 'weekend';

  return {
    recordType: raw.recordType === 'income' ? 'income' : 'expense',
    category: typeof raw.category === 'string' ? raw.category : '',
    date: typeof raw.date === 'string' ? raw.date : '',
    amount: typeof raw.amount === 'number' ? raw.amount : toNum(raw.amount, 0),
    paymentMethod:
      raw.paymentMethod === 'credit' || raw.paymentMethod === 'debit' || raw.paymentMethod === 'cash'
        ? raw.paymentMethod
        : undefined,
    paymentSubtypeLabel: typeof raw.paymentSubtypeLabel === 'string' ? raw.paymentSubtypeLabel.trim() : undefined,
    memo: typeof raw.memo === 'string' ? raw.memo : undefined,
    isRecurring: isRecurring || undefined,
    isInstallment: isInstallment || undefined,
    recurringType: isRecurring ? (recurringType || '매월') : undefined,
    totalMonths: isRecurring || isInstallment ? totalMonths : undefined,
    weekendOption: isRecurring || isInstallment ? weekendOption : undefined,
  };
}

function parseGeminiJson(text: string): ParseExpenseResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParseExpenseResponse;
    if (!Array.isArray(parsed.records)) return null;
    const rawSuggested = parsed.suggestedCategory ?? null;
    const records = parsed.records.map((r) =>
      normalizeRecord(
        typeof r === 'object' && r != null
          ? (r as unknown as Record<string, unknown>)
          : {},
      ),
    );
    return {
      records,
      suggestedCategory: normalizeSuggestedCategory(rawSuggested),
      reply: parsed.reply ?? null,
    };
  } catch {
    return null;
  }
}

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const secretErrorResponse = verifyInternalApiSecret(request);
    if (secretErrorResponse) {
      return secretErrorResponse;
    }

    const rateLimitCheck = checkRateLimit(
      request,
      'parse-expense',
      DEFAULT_AI_RATE_LIMIT_POLICY,
    );
    if (rateLimitCheck.response) {
      return rateLimitCheck.response;
    }

    const apiKey =
      process.env.awallet_gemini_api ?? process.env.AWALLET_GEMINI_API;
    if (!apiKey) {
      return Response.json(
        { error: 'awallet_gemini_api not configured' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const message = typeof body?.message === 'string' ? body.message : '';
    const rawHistory = Array.isArray(body?.history) ? body.history : [];
    const history = rawHistory
      .filter((h): h is { role: string; content: string } => typeof (h as { role?: unknown; content?: unknown })?.role === 'string' && typeof (h as { role?: unknown; content?: unknown })?.content === 'string')
      .map((h) => ({ role: h.role, content: h.content }));
    const categories = Array.isArray(body?.categories)
      ? (body.categories as string[]).filter((c): c is string => typeof c === 'string')
      : [];
    const paymentSubtypeOptions = Array.isArray(body?.paymentSubtypes)
      ? (body.paymentSubtypes as unknown[])
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const option = item as { type?: unknown; label?: unknown };
            if (
              (option.type === 'credit' || option.type === 'debit') &&
              typeof option.label === 'string' &&
              option.label.trim().length > 0
            ) {
              return {
                type: option.type,
                label: option.label.trim(),
              } as PaymentSubtypeOption;
            }
            return null;
          })
          .filter((item): item is PaymentSubtypeOption => item != null)
      : [];
    const today =
      typeof body?.today === 'string' && /^\d{4}\.\d{2}\.\d{2}$/.test(body.today)
        ? body.today
        : getTodayString();

    if (!message.trim()) {
      return Response.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    const systemPrompt = buildExpenseSystemPrompt(categories, today, paymentSubtypeOptions);
    const userPrompt = buildExpenseUserPrompt(message, history);
    const geminiModel = resolveGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[parse-expense] gemini failed', {
        model: geminiModel,
        status: res.status,
        details: errText.slice(0, 500),
      });
      return Response.json(
        { error: 'Gemini API error', model: geminiModel, details: errText },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let result = parseGeminiJson(text);

    if (!result) {
      return Response.json(
        { error: 'Failed to parse AI response' },
        { status: 502 }
      );
    }

    // 메시지 기반 fallback: 구독/매달/매월 등이 있는데 AI가 isRecurring을 안 준 경우
    const msg = message.toLowerCase();
    const inferredRecurringType = resolveExpenseRecurringTypeFromMessage(message);
    const hasRecurringHint =
      inferredRecurringType != null ||
      /구독|매달|매월|월세|정기|매주|매일/.test(msg) ||
      /subscription|monthly|recurring/.test(msg);
    const hasInstallmentHint = /할부|\d+개월\s*할부/.test(msg);
    if (result.records.length > 0) {
      const first = result.records[0] as ExpenseRecordSuggestion;
      const hasIncomeHint = /월급|급여|보너스|입금|용돈|환급|수입|꽁돈|용돈받/.test(msg) || /salary|income|bonus|windfall/.test(msg);
      if (hasIncomeHint) {
        result = {
          ...result,
          records: [
            {
              ...first,
              recordType: 'income',
              paymentMethod: undefined,
              paymentSubtypeLabel: undefined,
              isRecurring: undefined,
              isInstallment: undefined,
              recurringType: undefined,
              totalMonths: undefined,
              weekendOption: undefined,
            },
            ...result.records.slice(1),
          ],
        };
      } else if (hasRecurringHint && !first.isRecurring && !first.isInstallment) {
        result = {
          ...result,
          records: [
            {
              ...first,
              isRecurring: true,
              recurringType: inferredRecurringType || first.recurringType || '매월',
              totalMonths: first.totalMonths ?? 12,
              weekendOption: first.weekendOption ?? 'weekend',
            },
            ...result.records.slice(1),
          ],
        };
      } else if (first.isRecurring && inferredRecurringType && inferredRecurringType !== first.recurringType) {
        result = {
          ...result,
          records: [
            {
              ...first,
              recurringType: inferredRecurringType,
            },
            ...result.records.slice(1),
          ],
        };
      } else if (hasInstallmentHint && !first.isRecurring && !first.isInstallment) {
        const match = msg.match(/(\d+)개월/);
        const months = match ? Math.min(12, Math.max(2, parseInt(match[1], 10) || 3)) : 3;
        result = {
          ...result,
          records: [
            {
              ...first,
              isInstallment: true,
              totalMonths: first.totalMonths ?? months,
              weekendOption: first.weekendOption ?? 'weekend',
            },
            ...result.records.slice(1),
          ],
        };
      }
    }

    const holidayDate = await resolveHolidayDateFromMessage(message, today);
    if (holidayDate.status === 'unresolved') {
      return Response.json({
        records: [],
        suggestedCategory: result.suggestedCategory ?? null,
        reply: '날짜를 기입해 주세요.',
      });
    }

    const relativeDate =
      holidayDate.status === 'matched'
        ? holidayDate.date
        : resolveRelativeWeekdayDateFromMessage(message, today);
    if (relativeDate != null && result.records.length > 0) {
      result = {
        ...result,
        records: result.records.map((r) => ({ ...r, date: relativeDate })),
      };
    }

    if (result.records.length > 0) {
      result = {
        ...result,
        records: result.records.map((r) => {
          const isExpenseSeries =
            r.recordType !== 'income' && (r.isRecurring === true || r.isInstallment === true);
          if (!isExpenseSeries) return r;
          const seriesStartDate = resolveExpenseSeriesStartDateFromMessage(message, today, r.date);
          return seriesStartDate ? { ...r, date: seriesStartDate } : r;
        }),
      };
    }

    const mainAiMemo =
      result.records.length > 0 && typeof result.records[0].memo === 'string'
        ? result.records[0].memo
        : null;
    const memoPlan = buildMemoRefinementPlan(message, mainAiMemo);

    if (memoPlan != null && result.records.length > 0) {
      let finalMemo = memoPlan.ruleMemo;

      if (memoPlan.mode !== 'skip') {
        const aiMemo = await refineMemoWithGemini(
          {
            mode: memoPlan.mode === 'span' ? 'span' : 'full_message',
            text: memoPlan.aiInput,
            ruleMemo: memoPlan.ruleMemo,
          },
          apiKey,
          geminiModel,
        );
        if (aiMemo != null) {
          finalMemo = aiMemo;
        }
      }

      if (finalMemo != null) {
        result = {
          ...result,
          records: result.records.map((r, index) =>
            index === 0 ? { ...r, memo: finalMemo } : r,
          ),
        };
      }
    }

    recordRateLimitSuccess(rateLimitCheck.key, DEFAULT_AI_RATE_LIMIT_POLICY);
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { error: 'Server error', details: message },
      { status: 500 }
    );
  }
}
