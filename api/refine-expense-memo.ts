/**
 * 메모 추출·서술 제거 — Gemini micro-call (API 전용).
 */

export type RefineMemoMode = 'span' | 'full_message';

export interface RefineMemoRequest {
  mode: RefineMemoMode;
  text: string;
  ruleMemo?: string | null;
}

interface RefineMemoResponse {
  memo?: string;
}

function parseRefineMemoJson(text: string): string | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as RefineMemoResponse;
    const memo = typeof parsed.memo === 'string' ? parsed.memo.trim() : '';
    return memo.length > 0 ? memo : null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(mode: RefineMemoMode): string {
  if (mode === 'span') {
    return `지출 메모 추출기입니다. JSON만 출력합니다.
입력은 간편입력 문장에서 "메모"와 금액 사이 원문입니다.
memo에는 지출 대상·관계·내용(명사구)만 넣고, 행위·서술은 모두 제거합니다.
제거 예: 먹었어, 먹음, 먹었슴, 마셨어, 마심, 적심, 썼어, 갔다, 머금, 무금, 시켰어, 정산했어, 즐겼어 등
유지 예: "엄마랑 치킨", "형이랑 점심밥", "초이한테 박카스랑 계란"
JSON 형식: {"memo":"..."}`;
  }

  return `지출 메모 추출기입니다. JSON만 출력합니다.
입력은 간편입력 전체 문장(또는 문장+memo 초안)입니다.
사용자가 메모 기록을 요청했습니다(예: 메모도 넣어줘). 지출 내역 중 기록용 memo 명사구만 추출하세요.
memo에 넣을 것: 누구와, 무엇을, 어디서 등 지출 맥락(명사구).
제거할 것: 금액·원·결제수단·카테고리·날짜·"메모 넣어줘" 등 요청 문구·서술 동사(먹었는데, 썼어, 먹었어, 먹음 등).
예: "저녁에 치킨 먹었는데 5만원 썼어 메모도 넣어줘" → {"memo":"저녁 치킨"} 또는 {"memo":"치킨"}
예: "형이랑 점심 먹고 2만5천원 메모 남겨" → {"memo":"형이랑 점심"}
JSON 형식: {"memo":"..."}`;
}

export async function refineMemoWithGemini(
  request: RefineMemoRequest,
  apiKey: string,
  geminiModel: string,
): Promise<string | null> {
  const text = request.text.trim();
  if (text.length === 0) return null;

  const systemPrompt = buildSystemPrompt(request.mode);
  const userText =
    request.mode === 'full_message' && request.ruleMemo
      ? `${text}\n(규칙 초안: ${request.ruleMemo})`
      : text;

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
          parts: [{ text: userText }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 128,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    console.warn('[refine-expense-memo] gemini failed', {
      model: geminiModel,
      mode: request.mode,
      status: res.status,
    });
    return null;
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseRefineMemoJson(responseText);
}

/** @deprecated refineMemoWithGemini 사용 */
export async function refineMemoSpanWithGemini(
  rawSpan: string,
  apiKey: string,
  geminiModel: string,
): Promise<string | null> {
  return refineMemoWithGemini({ mode: 'span', text: rawSpan }, apiKey, geminiModel);
}
