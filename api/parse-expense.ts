/**
 * 에이전트: 사용자 메시지 → 지출 기록 제안 (Gemini API)
 * POST body: { message: string, history?: { role, content }[], categories?: string[], today?: string }
 *   - categories: 해당 사용자의 카테고리 목록(라벨만). 없으면 [].
 *   - today: 기준일 YYYY.MM.DD. 없으면 서버일자 사용.
 * Response: { records, suggestedCategory?, reply? }
 */

const PAYMENT_METHODS = ['credit', 'debit', 'cash'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

interface ExpenseRecordSuggestion {
  category: string;
  date: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  memo?: string;
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

function buildPrompt(
  message: string,
  history: { role: string; content: string }[],
  categories: string[],
  today: string
): string {
  const limited = history.slice(-MAX_HISTORY_MESSAGES);
  const historyText =
    limited.length > 0
      ? limited.map((h) => `${h.role === 'user' ? '사용자' : 'AI'}: ${h.content}`).join('\n')
      : '';
  const context = historyText ? `이전:\n${historyText}\n\n현재: ${message}` : message;
  const categoryList =
    categories.length > 0 ? categories.join(', ') : '(없음. suggestedCategory로만 제안)';

  return `가계부 지출 추출. JSON만 출력.

규칙:
1. 요청 없으면 생성/삭제 금지.
2. 결제 기본: credit. 체크/현금 요청 시 debit/cash. 기본값 지정 요청 시 기억.
3. 날짜는 기준일 ${today} 기준. YYYY.MM.DD.
4. 소비 외 질문→reply에 "소비 기록 관련해서만 답변드릴 수 있어요."
5. 부족한 항목 있으면 reply에 요청. 카테고리 목록에 없거나 비어있으면 반드시 suggestedCategory 1개 제안(이모지+이름 10자).

카테고리: ${categoryList}
- 목록이 비어있거나 매칭 없으면 records[].category는 null, suggestedCategory는 반드시 채움(예: 옷→쇼핑).
금액: 숫자만. 2만원→20000. paymentMethod: 신용/카드→credit, 체크/현금→debit/cash. 여러 건이면 records에 복수.

JSON 형식: {"records":[{"category","date","amount","paymentMethod","memo"}],"suggestedCategory":null 또는 {"label","emoji"},"reply":null}
reply는 사용자에게 할 말(부족한 항목 안내·거절 멘트 등) 있을 때만 문자열, 없으면 null.

${context}`;
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

function parseGeminiJson(text: string): ParseExpenseResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParseExpenseResponse;
    if (!Array.isArray(parsed.records)) return null;
    const rawSuggested = parsed.suggestedCategory ?? null;
    return {
      records: parsed.records,
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

    const prompt = buildPrompt(message, history, categories, today);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        { error: 'Gemini API error', details: errText },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const result = parseGeminiJson(text);

    if (!result) {
      return Response.json(
        { error: 'Failed to parse AI response' },
        { status: 502 }
      );
    }

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { error: 'Server error', details: message },
      { status: 500 }
    );
  }
}
