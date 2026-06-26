/**
 * 메모 raw 구간 서술 제거 — Gemini micro-call (API 전용).
 * 규칙 후처리로 부족할 때만 parse-expense에서 호출합니다.
 */

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

export async function refineMemoSpanWithGemini(
  rawSpan: string,
  apiKey: string,
  geminiModel: string,
): Promise<string | null> {
  const span = rawSpan.trim();
  if (span.length === 0) return null;

  const systemPrompt = `지출 메모 추출기입니다. JSON만 출력합니다.
입력은 간편입력 문장에서 "메모"와 금액 사이 원문입니다.
memo에는 지출 대상·관계·내용(명사구)만 넣고, 행위·서술은 모두 제거합니다.
제거 예: 먹었어, 먹음, 먹었슴, 마셨어, 마심, 적심, 썼어, 갔다, 머금, 무금, 시켰어, 정산했어, 즐겼어 등
유지 예: "엄마랑 치킨", "형이랑 점심밥", "초이한테 박카스랑 계란"
JSON 형식: {"memo":"..."}`;

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
          parts: [{ text: span }],
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
      status: res.status,
    });
    return null;
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseRefineMemoJson(text);
}
