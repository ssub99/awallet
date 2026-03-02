/**
 * 소비 리포트 / 챌린지 제안 생성 API (Gemini)
 *
 * POST body:
 * {
 *   fqScore: number;
 *   stats: {
 *     year: number;
 *     month: number;
 *     totalExpense: number;
 *     noSpendDays: number;
 *     totalDays: number;
 *     highAmountRatio?: number;
 *     categoryTotals?: { category: string; amount: number; ratio: number }[];
 *   }
 * }
 *
 * Response:
 * {
 *   summary: string;   // 이번 달 리포트 한-두 문단
 *   challenge: string; // 다음 주 챌린지 제안 한-두 문단
 * }
 */

interface CategoryTotalInput {
  category: string;
  amount: number;
  ratio: number;
}

interface StatsInput {
  year: number;
  month: number;
  totalExpense: number;
  noSpendDays: number;
  totalDays: number;
  highAmountRatio?: number;
  categoryTotals?: CategoryTotalInput[];
}

interface ConsumptionReportRequest {
  fqScore: number;
  stats: StatsInput;
}

interface ConsumptionReportResponse {
  summary: string;
  challenge: string;
}

function buildConsumptionPrompt(payload: ConsumptionReportRequest): string {
  const { fqScore, stats } = payload;
  const {
    year,
    month,
    totalExpense,
    noSpendDays,
    totalDays,
    highAmountRatio,
    categoryTotals = [],
  } = stats;

  const topCategories = categoryTotals
    .slice(0, 3)
    .map(
      (c, idx) =>
        `${idx + 1}위: "${c.category}" - ${c.amount.toLocaleString('ko-KR')}원 (${(c.ratio * 100).toFixed(1)}%)`,
    )
    .join('\n');

  const highSingleText =
    typeof highAmountRatio === 'number'
      ? `${(highAmountRatio * 100).toFixed(1)}%`
      : '알 수 없음';

  return `당신은 가계부 코칭을 위한 한국어 소비 분석가입니다.
아래의 숫자 데이터만을 기반으로, 사용자의 이번 달 소비 패턴을 요약하고 다음 주에 시도하면 좋은 챌린지를 제안해 주세요.

출력은 반드시 JSON 한 덩어리로만, 아래 형식을 지켜서 제공합니다.

{
  "summary": "<이번 달 소비 리포트 한두 문단. 줄바꿈은 \\n 사용.>",
  "challenge": "<다음 주에 시도할 챌린지 제안 한두 문단. 줄바꿈은 \\n 사용.>"
}

규칙:
- 존댓말(반말 금지)을 사용합니다.
- 금액은 "12,300원"처럼 한국 통화 형식으로 표현합니다.
- 특정 카테고리를 언급할 때는 따옴표로 감싸 주세요. 예: "카페", "식비"
- 사용자의 죄책감을 과도하게 자극하지 말고, 실천 가능한 작은 변화에 초점을 둡니다.
- summary에는 "이번 달 전반적인 소비 패턴"과 "눈에 띄는 특징 1~2가지"를 넣습니다.
- challenge에는 "다음 주 1주일 동안 시도해 볼 수 있는 구체적인 행동 1~2가지"를 제안합니다.
- 가능한 경우 상위 카테고리(특히 1~2위)를 중심으로 설명하고, 한두 줄 정도로 요약된 목표를 포함합니다.

입력 데이터:
- 연도/월: ${year}년 ${month}월
- FQ 점수: ${fqScore.toFixed(1)}점 (0~100점, 높을수록 바람직한 소비 패턴)
- 월간 총 지출: ${totalExpense.toLocaleString('ko-KR')}원
- 무지출일: ${noSpendDays}일 / ${totalDays}일
- 고액 단건 비율(참고용): ${highSingleText}
- 상위 카테고리:
${topCategories || '(카테고리 데이터 없음)'}`;
}

function parseReportJson(text: string): ConsumptionReportResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ConsumptionReportResponse>;
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const challenge = typeof parsed.challenge === 'string' ? parsed.challenge.trim() : '';
    if (!summary || !challenge) return null;
    return { summary, challenge };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const apiKey = process.env.awallet_gemini_api ?? process.env.AWALLET_GEMINI_API;
    if (!apiKey) {
      return Response.json(
        { error: 'awallet_gemini_api not configured' },
        { status: 500 },
      );
    }

    const body = (await request.json()) as Partial<ConsumptionReportRequest>;
    if (
      typeof body?.fqScore !== 'number' ||
      !body.stats ||
      typeof body.stats.year !== 'number' ||
      typeof body.stats.month !== 'number' ||
      typeof body.stats.totalExpense !== 'number' ||
      typeof body.stats.noSpendDays !== 'number' ||
      typeof body.stats.totalDays !== 'number'
    ) {
      return Response.json(
        { error: 'Invalid request body' },
        { status: 400 },
      );
    }

    const payload: ConsumptionReportRequest = {
      fqScore: body.fqScore,
      stats: {
        year: body.stats.year,
        month: body.stats.month,
        totalExpense: body.stats.totalExpense,
        noSpendDays: body.stats.noSpendDays,
        totalDays: body.stats.totalDays,
        highAmountRatio: body.stats.highAmountRatio,
        categoryTotals: Array.isArray(body.stats.categoryTotals)
          ? body.stats.categoryTotals.map((c) => ({
              category: String(c.category ?? '').slice(0, 24),
              amount: Number(c.amount ?? 0),
              ratio: Number(c.ratio ?? 0),
            }))
          : [],
      },
    };

    const prompt = buildConsumptionPrompt(payload);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        { error: 'Gemini API error', details: errText },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parseReportJson(text);

    if (!parsed) {
      return Response.json(
        { error: 'Failed to parse AI response' },
        { status: 502 },
      );
    }

    return Response.json(parsed, { status: 200 });
  } catch (error) {
    console.error('[consumption-report] error:', error);
    return Response.json(
      { error: 'Unexpected error' },
      { status: 500 },
    );
  }
}

