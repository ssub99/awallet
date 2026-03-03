import { getBaseSystemPrompt } from './ai-system-prompts';

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
 *     expenseCount?: number;
 *     activeDays?: number;
 *   }
 * }
 *
 * Response:
 * {
 *   scoreFeedback: string;
 *   summaryTitle: string;
 *   summary: string;
 *   challenge: string;
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
  /** 이번 달 전체 지출 건수 */
  expenseCount?: number;
  /** 지출이 있었던 날짜 수 */
  activeDays?: number;
}

interface ConsumptionReportRequest {
  fqScore: number;
  stats: StatsInput;
}

interface ConsumptionReportResponse {
  scoreFeedback: string;
  summaryTitle: string;
  summary: string;
  challenge: string;
}

function buildConsumptionSystemPrompt(): string {
  const base = getBaseSystemPrompt();
  return `${base}

소비 리포트와 다음 주 챌린지 제안을 생성하는 에이전트입니다.
입력으로 주어지는 월간 소비 데이터를 기반으로, 이번 달 소비 패턴을 요약하고 다음 주에 시도해 볼 수 있는 작은 행동 챌린지를 제안해 주세요.

출력은 반드시 JSON 한 덩어리로만, 아래 형식을 지켜서 제공합니다.

{
  "scoreFeedback": "<FQ 점수에 대한 감성적인 한 문장 피드백. 줄바꿈(\\n) 없이 한 문장만 작성.>",
  "summaryTitle": "<이번 달 소비 패턴을 한 문장으로 요약하는 제목. 맨 앞에 단일 이모지 한 개 포함. 줄바꿈(\\n) 없이 한 문장만 작성.>",
  "summary": "<이번 달 소비 리포트 한두 문단. 줄바꿈은 \\n 사용. 최대 10줄.>",
  "challenge": "<다음 주에 시도할 챌린지 제안 한두 문단. 줄바꿈은 \\n 사용. 최대 10줄.>"
}

공통 규칙:
- 항상 한국어, 존댓말을 사용합니다.
- 금액은 "12,300원"처럼 한국 통화 형식으로 표현합니다.
- 특정 카테고리는 따옴표로 감싸서 표기합니다. 예: "카페", "식비"
- 사용자의 죄책감을 과도하게 자극하지 말고, 실천 가능한 작은 변화에 초점을 둡니다.
- 네 필드(scoreFeedback, summaryTitle, summary, challenge)는 모두 반드시 채워야 하며, null이나 빈 문자열은 허용되지 않습니다.

[scoreFeedback 작성 규칙]
- FQ 점수에 대한 감성적인 한 문장 피드백만 작성합니다.
- 점수에 대한 전반적인 인상(예: "이번 달 소비 페이스는 전체적으로 안정적인 편입니다.")을 부드럽게 전달합니다.
- 줄바꿈(\\n)은 사용하지 말고, 정확히 한 문장만 작성합니다.

[summaryTitle 작성 규칙]
- summary 전체 내용을 바탕으로, 이번 달 소비 패턴을 한 문장으로 요약하는 제목을 작성합니다.
- 문장 맨 앞에는 이 내용을 잘 표현하는 단일 이모지(예: 📊, 💰, 📉, 📈, ⏳ 등)를 하나 포함합니다.
- 점수에 대한 감성적인 표현은 scoreFeedback에 맡기고, summaryTitle은 "지금 어떤 상태인지"를 객관적으로 설명하는 데 집중합니다.
- 줄바꿈(\\n)은 사용하지 말고, 정확히 한 문장만 작성합니다.

[summary 작성 규칙]
- "이번 달 전반적인 소비 패턴"을 설명하고, 눈에 띄는 특징 1~2가지를 구체적으로 서술합니다.
- 기록이 적은 경우에는, 먼저 "기록이 아직 많지 않아 소비 패턴을 단정하기는 이르다"는 취지를 짧게 언급합니다.
- 상위 카테고리와 금액 수준을 자연스럽게 녹여서 설명합니다.
- 줄바꿈(\\n)을 사용해 문단을 2~3줄 단위로 나누고, 최대 10줄(\\n 기준)을 넘기지 않습니다.

[challenge 작성 규칙]
- 다음 주 1주일 동안 시도해 볼 수 있는 구체적인 행동 1~2가지를 제안합니다.
- 데이터가 적을 때는 "지출을 빠짐없이 기록해보기", "충동 구매를 하루에 한 번만 줄여보기"처럼 작고 실천 가능한 목표에 초점을 맞춥니다.
- 데이터가 충분할 때는 상위 소비 카테고리(예: "카페", "야식", "편의점", "간식", "쇼핑")를 중심으로 부담되지 않는 챌린지를 제안합니다.
- summary와 마찬가지로 줄바꿈(\\n)을 사용해 문단을 나누고, 최대 10줄(\\n 기준)을 넘기지 않습니다.

줄바꿈/형식 공통 규칙:
- summary와 challenge는 각각 최대 10줄(\\n 기준)을 넘지 않습니다.
- 숫자나 금액(예: 3회, 12,300원, 30%)이 포함된 문장은 가능하면 별도 줄에 배치합니다.
- summary와 challenge의 마지막 줄은 행동을 유도하는 문장(격려 또는 다음 행동 제안)으로 마무리합니다.

[데이터 양에 따른 피드백 모드]

입력 데이터 중 다음 조건을 확인하세요:
- expenseCount: 이번 달 지출 건수
- activeDays: 지출이 있었던 날짜 수
- totalExpense: 월간 총 지출

다음 중 하나라도 만족하면 "데이터가 아직 적은 상태"입니다:
- expenseCount < 10
- activeDays < 5
- totalExpense < 100,000원

데이터가 아직 적은 상태일 때:
- summary 앞부분에서 "기록이 아직 많지 않아 소비 패턴을 단정하기는 이르다"는 취지를 짧게 언급합니다.
- 현재까지의 지출 규모와 상위 카테고리를 가볍게 소개합니다.
- 특정 카테고리를 강하게 문제 삼지 말고, 충동 소비를 한 번 더 점검해 보라는 수준의 부드러운 톤을 유지합니다.
- challenge에서는 "지출을 빠짐없이 기록해보기", "충동 구매를 하루에 한 번만 줄여보기"와 같은 작고 구체적인 목표 1~2개만 제안합니다.
- 이 모드에서는 특정 카테고리를 강하게 줄이라고 요구하는 문구를 사용하지 않습니다.

데이터가 충분한 상태일 때:
- 상위 카테고리 비중을 근거로, 생활비/소비 카테고리(예: "카페", "야식", "편의점", "간식", "쇼핑")에 대한 구체적인 챌린지를 제안해도 좋습니다.`;
}

function buildConsumptionUserPrompt(payload: ConsumptionReportRequest): string {
  const { fqScore, stats } = payload;
  const {
    year,
    month,
    totalExpense,
    noSpendDays,
    totalDays,
    highAmountRatio,
    categoryTotals = [],
    expenseCount,
    activeDays,
  } = stats;

  const topCategories = categoryTotals
    .slice(0, 3)
    .map(
      (c, idx) =>
        `${idx + 1}위: "${c.category}" - ${c.amount.toLocaleString('ko-KR')}원 (${(
          c.ratio * 100
        ).toFixed(1)}%)`,
    )
    .join('\n');

  const highSingleText =
    typeof highAmountRatio === 'number'
      ? `${(highAmountRatio * 100).toFixed(1)}%`
      : '알 수 없음';

  return `이번 달 소비 데이터는 다음과 같습니다.

- 연도/월: ${year}년 ${month}월
- FQ 점수: ${fqScore.toFixed(1)}점 (0~100점, 높을수록 바람직한 소비 패턴)
- 월간 총 지출: ${totalExpense.toLocaleString('ko-KR')}원
- 전체 일수 대비 무지출일: ${noSpendDays}일 / ${totalDays}일
- 고액 단건 비율(참고용): ${highSingleText}
- 이번 달 지출 건수(expenseCount): ${
    typeof expenseCount === 'number' ? expenseCount : '알 수 없음'
  }건
- 지출이 있었던 날짜 수(activeDays): ${
    typeof activeDays === 'number' ? activeDays : '알 수 없음'
  }일
- 상위 카테고리 TOP 3:
${topCategories || '(카테고리 데이터 없음)'}

위 데이터를 기반으로, 위에서 설명한 JSON 형식으로만 응답해 주세요.`;
}

function parseReportJson(text: string): ConsumptionReportResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ConsumptionReportResponse>;
    const scoreFeedback =
      typeof parsed.scoreFeedback === 'string' ? parsed.scoreFeedback.trim() : '';
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const summaryTitle =
      typeof parsed.summaryTitle === 'string' ? parsed.summaryTitle.trim() : '';
    const challenge = typeof parsed.challenge === 'string' ? parsed.challenge.trim() : '';
    if (!summary || !challenge) return null;
    return { scoreFeedback, summaryTitle, summary, challenge };
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
        expenseCount: body.stats.expenseCount,
        activeDays: body.stats.activeDays,
      },
    };

    const systemPrompt = buildConsumptionSystemPrompt();
    const userPrompt = buildConsumptionUserPrompt(payload);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
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

