/**
 * 에이전트: 사용자 메시지 → 지출 기록 제안 (Gemini API)
 * POST body: { message: string, history?: { role: 'user'|'assistant', content: string }[] }
 * Response: { records: { category, date, amount, paymentMethod?, memo? }[], suggestedCategory?: { label, emoji } }
 */

const EXPENSE_CATEGORY_LABELS = [
  '식비', '배달음식', '카페/편의점/간식', '교통비', '주거비', '공과금', '통신비',
  '쇼핑', '미용', '운동/헬스', '구독 서비스', '영화', '취미', '여행', '모임/술',
  '경조사/선물', '차량', '대출/이자', '보험', '적금', '투자', '세금', '기타',
] as const;

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
}

function buildPrompt(message: string, history: { role: string; content: string }[]): string {
  const historyText = history.length
    ? history
        .map((h) => `${h.role === 'user' ? '사용자' : 'AI'}: ${h.content}`)
        .join('\n')
    : '';
  const context = historyText ? `\n\n이전 대화:\n${historyText}\n\n현재 사용자 메시지: ${message}` : message;

  return `당신은 가계부 앱의 지출 기록 추출기입니다. 사용자 메시지에서 지출 정보를 추출해 JSON으로만 답하세요.

규칙:
- 날짜는 반드시 YYYY.MM.DD 형식 (예: 2025.01.30). "어제"/"오늘"은 실제 날짜로 변환 (기준일은 오늘).
- 금액은 숫자만 (단위 없이). "2만원" → 20000, "오천" → 5000.
- 카테고리는 아래 목록에서 골라야 함. 없으면 suggestedCategory에 새 카테고리 제안 (label, emoji).
- paymentMethod: "신용카드"/"카드" → credit, "체크"/"현금" → debit, "현금" → cash. 모르면 생략.
- 한 메시지에 여러 건이면 records에 여러 개. "어제 오늘 각 2만원"이면 2건.

카테고리 목록: ${EXPENSE_CATEGORY_LABELS.join(', ')}

응답은 반드시 아래 JSON만 출력 (다른 설명 없이):
{"records":[{"category":"식비","date":"2025.01.30","amount":20000,"paymentMethod":"credit","memo":""}],"suggestedCategory":null}

사용자 메시지: ${context}`;
}

function parseGeminiJson(text: string): ParseExpenseResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParseExpenseResponse;
    if (!Array.isArray(parsed.records)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const apiKey = process.env.awallet_gemini_api;
    if (!apiKey) {
      return Response.json(
        { error: 'awallet_gemini_api not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const message = typeof body?.message === 'string' ? body.message : '';
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message.trim()) {
      return Response.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(message, history);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
