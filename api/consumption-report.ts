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
  scoreFeedback: string[];
  summaryTitle: string;
  summary: string[];
  challenge: string[];
  nextWeekGoal: string[];
}

function buildConsumptionSystemPrompt(): string {
  const base = getBaseSystemPrompt();
  return `${base}

소비 리포트와 다음 주 챌린지 제안을 생성하는 에이전트입니다.
입력으로 주어지는 월간 소비 데이터를 기반으로, 이번 달 소비 패턴을 요약하고 다음 주에 시도해 볼 수 있는 작은 행동 챌린지를 제안해 주세요.

출력은 반드시 JSON 한 덩어리로만, 아래 형식을 지켜서 제공합니다.

{
  "scoreFeedback": "<이번 달 소비 점수에 대한 전반적인 느낌을 한두 문장으로 설명하는 문자열>",
  "summaryTitle": "<이번 달 소비 패턴을 한 문장으로 요약하는 제목 문자열>",
  "summary": ["<이번 달 소비 리포트 내용의 첫 번째 문장>", "<두 번째 문장>", "..."],
  "challenge": ["<다음 주 챌린지 제안의 첫 번째 문장>", "<두 번째 문장>", "..."],
  "nextWeekGoal": ["<다음 주에 실천할 핵심 목표를 요약한 문장>", "<필요하다면 두 번째 목표 문장>"]
}

공통 규칙:
- 항상 한국어, 존댓말을 사용합니다.
- 말투는 "~요", "~어요" 체를 사용합니다. "~입니다", "~습니다" 같은 다나까체는 사용하지 않습니다.
- 금액은 "12,300원"처럼 한국 통화 형식으로 표현합니다.
- 특정 카테고리는 따옴표로 감싸서 표기합니다. 예: "카페", "식비"
- 사용자의 죄책감을 과도하게 자극하지 말고, 실천 가능한 작은 변화에 초점을 둡니다.
- 다섯 필드(scoreFeedback, summaryTitle, summary, challenge, nextWeekGoal)는 모두 가능한 한 의미 있는 문장으로 채우는 것을 목표로 합니다.
- 사용자는 FQ 또는 FQ 점수라는 워딩을 이해하기 힘드니 소비 점수라는 워딩으로 대체해서 설명해야 합니다.

[scoreFeedback 작성 규칙]
- 이번 달 소비 점수에 대한 **전반적인 느낌**을 한두 문장으로 부드럽게 설명해야 합니다.
- “이번 달 소비 상태/패턴에 대한 감성적인 피드백을 주어야만 합니다.
- FQ 점수 또는 FQ점수의 상수를 언급하지 말고 피드백을 주어야 합니다.
- 점수의 구체적인 숫자(예: "75점")는 이미 카드에서 따로 보여주고 있으므로, scoreFeedback에서는 점수를 언급하지 않아야 합니다.
- "소비 점수"라는 단어를 반복해서 강조하기보다는, 현재 소비 패턴이 안정적인지/빠른지/조금만 조정하면 되는지 등 **상태에 대한 감상**을 중심으로 작성합니다.
- 각 문장 끝에서 실제 줄바꿈(엔터 또는 \\n)을 넣어, 전체적으로 1~2줄 정도가 되도록 작성합니다.
- 줄 수는 최대 2줄(\\n 기준)을 넘기지 않습니다.

[summaryTitle 작성 규칙]
- summary 전체 내용을 바탕으로, 이번 달 소비 패턴을 한 문장으로 요약하는 제목을 작성합니다.
- 문장 맨 앞에는 이 내용을 잘 표현하는 이모지(예: 💬, 💰, 📉, 📈, ⏳ 등)중 임의의 이모지를 표기 합니다.
- 점수에 대한 감성적인 표현은 scoreFeedback에 맡기고, summaryTitle은 "지금 어떤 상태인지"를 객관적으로 설명하는 데 집중합니다.
- 줄바꿈(\\n)은 사용하지 말고, 정확히 한 문장만 작성합니다.
- summaryTitle의 텍스트 길이는 25자를 넘지 않도록 합니다.

[summary 작성 규칙]
- "이번 달 전반적인 소비 패턴"을 설명하고, 눈에 띄는 특징 1~2가지를 구체적으로 서술합니다.
- summary는 문자열 배열이며, 각 요소는 하나의 문장 또는 짧은 문단을 의미합니다.
- 기록이 적은 경우에는, 먼저 "기록이 아직 많지 않아 소비 패턴을 단정하기는 이르다"는 취지를 짧게 언급하는 문장을 포함합니다.
- 상위 카테고리와 금액 수준을 자연스럽게 녹여서 설명합니다.
- summary 배열의 길이는 최대 10개를 넘기지 않습니다.

[challenge 작성 규칙]
- 다음 주 1주일 동안 시도해 볼 수 있는 구체적인 행동 1~2가지를 제안합니다.
- challenge는 문자열 배열이며, 각 요소는 하나의 문장 또는 짧은 문단을 의미합니다.
- 데이터가 적을 때는 "지출을 빠짐없이 기록해보기", "충동 구매를 하루에 한 번만 줄여보기"처럼 작고 실천 가능한 목표에 초점을 맞춥니다.
- 데이터가 충분할 때는 상위 소비 카테고리(예: "카페", "야식", "편의점", "간식", "쇼핑")를 중심으로 부담되지 않는 챌린지를 제안합니다.
- 배열 길이는 최대 10개를 넘기지 않습니다.
- 특정 카테고리를 챌린지 대상으로 선택했다면, "이번 달 이 카테고리의 총 사용 금액"과 "전체 지출에서 차지하는 비율(%)"을 함께 언급해,
  왜 이 카테고리를 다음 주 목표 대상으로 제안하는지 사용자가 이해할 수 있도록 한두 개의 요소(문장)로 근거를 설명합니다.

[nextWeekGoal 작성 규칙]
- nextWeekGoal은 문자열 배열이며, 다음 주 1주일 동안 실천할 "핵심 목표"만을 1~3개의 요소로 요약합니다.
- challenge에 작성한 내용 중 가장 중요한 행동 목표만 뽑아 압축해서 작성합니다.
- 배열 길이는 최대 10개를 넘기지 않습니다.
- 데이터가 5건 미만인 경우 해당 월에 기록한 카테고리 대비 전월엔 N회∙NN,NNN원을 소비했는지 언급하여 앞으로의 소비 습관을 제시합니다.
- 다음주 목표를 제안할 떄 주요 카테고리의 비율 및 소비총액을 언급하고 해당 카테고리의 지출대비 적절한 목표금액을 제시해야 합니다.(데이터가 5건 이상인 경우에만 해당)
- 다음 주 목표 제안 시 기록한 데이터가 충동적인 소비인지 아닌지에 대한 분석이 필요합니다. (예시 : 같은 날 동일 카테고리 2건 이상, 단일 지출이 당월 전체 건당 평균의 300% 초과, 특정 카테고리의 이번 주 지출이 당월 주 평균 대비 200% 이상 급증 등등)
- 특정 카테고리를 직접 언급하는 경우, challenge에서 설명한 것과 동일하게 "이번 달 이 카테고리의 총 사용 금액"과 "전체 지출 대비 비율(%)"을 간단히 다시 상기시켜,
  어떤 지점을 의식하면서 목표를 실천하면 좋을지 이해할 수 있도록 작성합니다.

줄바꿈/형식 공통 규칙:
- summary, challenge, nextWeekGoal 배열의 각 요소는 하나의 문장 또는 짧은 문단을 의미하며, 자동 줄바꿈은 클라이언트에서 처리합니다.
- 숫자나 금액(예: 3회, 12,300원, 30%)이 포함된 설명은 가능하면 별도의 요소(문장)로 분리해서 작성합니다.
- summary와 challenge 배열의 마지막 요소는 행동을 유도하는 문장(격려 또는 다음 행동 제안)으로 마무리합니다.

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
- 현재까지의 지출 규모를, 주요 카테고리별로 "건수와 금액 수준" 위주로만 가볍게 소개합니다.
- 이 모드에서는 상위 카테고리 비율(예: 전체 지출의 XX%)을 근거로 특정 카테고리 지출을 줄이라고 요구하는 문장을 작성하면 안 됩니다.
- 또한, 특정 카테고리 이름과 "줄이다/줄여보세요/줄이는" 등 직접적인 절약·통제 표현을 함께 사용하는 문장은 작성하지 않습니다.
- challenge에서는 지출을 빠짐없이 기록하기, 충동적인 소비를 하기 전에 한 번 더 생각해 보기 등 "기록/관찰/자기 점검"에 대한 작고 구체적인 목표 1~2개만 제안합니다.

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

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : String(v)))
      .flatMap((s) => s.split('\n'))
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 10);
  }
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 10);
  }
  return [];
}

function parseReportJson(text: string): ConsumptionReportResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ConsumptionReportResponse> & {
      summary?: string | string[];
      challenge?: string | string[];
      nextWeekGoal?: string | string[];
      scoreFeedback?: string | string[];
    };
    const scoreFeedbackArray = normalizeTextArray(parsed.scoreFeedback);
    const summaryArray = normalizeTextArray(parsed.summary);
    const summaryTitle =
      typeof parsed.summaryTitle === 'string' ? parsed.summaryTitle.trim() : '';
    const challengeArray = normalizeTextArray(parsed.challenge);
    const nextWeekGoalArray = normalizeTextArray(parsed.nextWeekGoal);
    if (summaryArray.length === 0 || challengeArray.length === 0) return null;
    return {
      scoreFeedback: scoreFeedbackArray,
      summaryTitle,
      summary: summaryArray,
      challenge: challengeArray,
      nextWeekGoal: nextWeekGoalArray,
    };
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

