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
    expenseCount,
    activeDays,
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
  "scoreFeedback": "<FQ 점수에 대한 감성적인 한 문장 피드백. 줄바꿈(\\n) 없이 한 문장만 작성.>",
  "summaryTitle": "<이번 달 소비 패턴을 한 문장으로 요약하는 제목. 줄바꿈(\\n) 없이 한 문장만 작성. 감성적인 표현보다는, 데이터에 기반해 현재 달의 소비 상태를 직관적으로 설명하는 문장을 사용하세요. 타이틀 맨 앞에는 이 내용을 잘 표현하는 단일 이모지(예: 📊, 💰, 📉, 📈, ⏳ 등)를 하나 포함해 주세요.>",
  "summary": "<이번 달 소비 리포트 한두 문단. 줄바꿈은 \\n 사용.>",
  "challenge": "<다음 주에 시도할 챌린지 제안 한두 문단. 줄바꿈은 \\n 사용.>"
}

규칙(아주 중요):
- 존댓말(반말 금지)을 사용합니다.
- 금액은 "12,300원"처럼 한국 통화 형식으로 표현합니다.
- 특정 카테고리를 언급할 때는 따옴표로 감싸 주세요. 예: "카페", "식비"
- 사용자의 죄책감을 과도하게 자극하지 말고, 실천 가능한 작은 변화에 초점을 둡니다.
- scoreFeedback에는 FQ 점수에 대한 감성적인 한 문장 피드백만 작성합니다.
  - 예: "이번 달 소비 페이스는 전체적으로 안정적인 편입니다." 처럼, 점수에 대한 전반적인 인상을 부드럽게 알려주는 문장
  - 줄바꿈(\\n)은 사용하지 말고, 한 문장으로만 작성하세요.
- summaryTitle에는 summary 전체 내용을 바탕으로, 이번 달 소비 패턴을 한 문장으로 요약하는 제목을 작성합니다.
  - 예: "📊 이번 달에는 필수 지출이 대부분을 차지하고, 카페 지출은 전체의 20% 수준입니다." 처럼, 데이터에 기반한 요약 문장
  - 타이틀 맨 앞에는 이 내용을 잘 표현하는 단일 이모지(예: 📊, 💰, 📉, 📈, ⏳ 등)를 하나 포함해 주세요.
  - 점수에 대한 감성적인 표현은 scoreFeedback에 맡기고, summaryTitle은 "무슨 상태인지"를 객관적으로 설명하는 데 집중하세요.
  - 줄바꿈(\\n)은 사용하지 말고, 한 문장으로만 작성하세요.
- summary에는 "이번 달 전반적인 소비 패턴"과 "눈에 띄는 특징 1~2가지"를 구체적으로 설명합니다.
- challenge에는 "다음 주 1주일 동안 시도해 볼 수 있는 구체적인 행동 1~2가지"를 제안합니다.
- 가능한 경우 상위 카테고리(특히 1~2위)를 중심으로 설명하고, 한두 줄 정도로 요약된 목표를 포함합니다.
- 챌린지를 제안할 때는, 반복적으로 많이 나가는 생활비/소비 카테고리(예: "카페", "야식", "편의점", "간식", "쇼핑")를 우선 대상으로 삼고,
  세금·병원비·대형가전·등록금처럼 한두 번만 발생한 고액 필수 지출은 챌린지 대상으로 삼지 말고 단순 참고용으로만 언급합니다.
- scoreFeedback, summaryTitle, summary, challenge 네 가지 필드는 모두 **반드시 포함**해야 합니다.
  - 어떤 필드도 생략하거나 null, 빈 문자열("")로 두지 마세요.
  - 네 필드 모두 의미 있는 한국어 문장으로 채워야 올바른 응답으로 간주됩니다.

줄바꿈·형식 규칙(반드시 지켜야 합니다):
1. 문장은 2~3줄 단위로 끊어서 작성하세요. 하나의 문단 안에서도 너무 긴 줄을 만들지 말고, 적당한 위치에서 \\n 으로 줄을 나누세요.
2. 핵심 내용이 바뀔 때마다 줄바꿈(\\n)을 넣어, 항목별로 의미가 구분되도록 작성하세요.
3. 숫자나 금액(예: 3회, 12,300원, 30%)이 포함된 문장은 가능하면 별도의 줄에 단독으로 표기하세요.
4. summary와 challenge 각각의 마지막 줄은 반드시 행동을 유도하는 문장(챌린지 제안 또는 격려 문장)으로 끝내세요.
5. summary는 최대 10줄, challenge도 최대 10줄(각각 \\n 기준)을 넘지 않도록, 핵심 내용만 간결하게 작성하세요.

[데이터 양에 따른 피드백 모드]
- 아래 조건 중 하나라도 만족하면 "데이터가 아직 적은 상태"로 간주합니다:
  - 이번 달 지출 건수(expenseCount)가 10건 미만이거나
  - 지출이 있었던 날짜 수(activeDays)가 5일 미만이거나
  - 월간 총 지출(totalExpense)이 100,000원 미만인 경우

- 데이터가 아직 적은 상태일 때:
  1) summary의 앞부분에서 "기록이 아직 많지 않아 소비 패턴을 단정하기는 이르다"는 문장을 짧게 언급해 주세요.
  2) 현재까지의 지출 규모를 알려주는 문장을 포함해 주세요.
     예: 지금까지는 "카페"에서 총 8,000원 정도 사용하셨습니다. 와 같이, 상위 카테고리와 금액 수준을 설명합니다.
  3) 특정 카테고리를 과도하게 문제 삼지 말고, 충동적인 소비를 한 번 더 점검해 보라는 정도의 부드러운 조언에 집중해 주세요.
  4) 이 모드에서는 summary와 challenge 어디에도
     "이번 달 절약을 위해 카페/편의점/간식 카테고리의 챌린지를 시작해보세요." 와 같은 강한 챌린지 문구를 사용하지 마세요.
  5) challenge에서는 "하루에 한 번만 충동 구매를 줄여보기", "이번 주에는 지출을 빠짐없이 기록해보기" 처럼
     작고 실천 가능한 행동 목표 1~2개만 제안해 주세요.

- 데이터가 충분한 상태일 때만:
  - 상위 카테고리 비중을 근거로, 카테고리별 챌린지(예: 카페/편의점/간식 지출 줄이기)를 제안해도 좋습니다.

중요: 아래 예시는 "톤과 구조"를 보여주는 참고용일 뿐이며, 실제 생성 시에는 월별 데이터 분석 결과에 따라 이와 다른 자연스러운 패턴으로 작성해도 됩니다.
단, 위의 규칙(줄 수, 줄바꿈, 존댓말, 챌린지 강도 등)은 반드시 지켜야 합니다.

[summary 예시 패턴들 (참고용)]
- 예시 1:
  "이번 달에는 아직 기록이 많지 않아 소비 패턴을 단정하기는 이릅니다.\n현재까지는 \"카페\"와 몇 가지 고정비 중심으로 지출이 이루어지고 있습니다.\n앞으로 며칠만 더 꾸준히 기록해 주시면, 패턴이 더 또렷하게 드러날 거예요."

- 예시 2:
  "이번 달 소비는 전체적으로 소액 위주의 일상 생활비에 집중되어 있습니다.\n특히 \"식비\"와 \"카페\"가 눈에 띄는데, 평일 저녁 시간대에 지출이 자주 발생하고 있어요.\n주말보다 평일에 조금만 사용을 조절해도 한 달 총 지출을 꽤 줄일 수 있는 패턴입니다."

- 예시 3:
  "이번 달에는 아직 일부 날짜에만 소비가 몰려 있어, 전체적인 흐름은 조금 더 지켜볼 필요가 있습니다.\n지금까지는 \"카페\" 카테고리가 1건, 약 8,000원 정도로 기록되어 있고, 나머지는 고정비·필수 지출 위주예요.\n이 상태에서는 특정 카테고리를 줄이기보다는, 충동적인 소비가 생기지 않도록 한 번 더 생각하고 사용하는 습관이 더 중요해 보입니다."

- 예시 4:
  "이번 달 소비 패턴을 보면, \"카페\", \"편의점\", \"간식\"처럼 가벼운 지출이 자주 등장하고 있습니다.\n금액은 각각 크지 않지만, 여러 날에 걸쳐 반복되면서 누적되는 경향이 보여요.\n이 부분을 조금만 의식해도 한 달 전체 소비 흐름이 훨씬 안정적으로 바뀔 수 있습니다."

- 예시 5:
  "이번 달에는 아직 기록 건수가 많지 않지만, 고정비를 포함해 약간씩 지출이 쌓이고 있는 단계입니다.\n\"카페\" 지출은 지금까지 1건, 총 8,000원 정도로 기록되어 있고, 나머지는 필수 지출 위주예요.\n이 시기에는 패턴을 바꾸기보다는, 어떤 상황에서 소비를 하게 되는지 관찰하는 것만으로도 충분히 의미가 있습니다."

- 예시 6:
  "현재까지의 소비를 보면, 특정 요일·시간대에 약간의 패턴이 보이기 시작했습니다.\n특히 금요일 저녁과 주말에 \"카페\"나 외식 지출이 평일보다 조금 더 많은 편이에요.\n아직 과소비라고 보기는 어렵지만, 주말 사용 패턴만 살짝 정리해도 균형 잡힌 한 달을 만들 수 있습니다."

- 예시 7:
  "이번 달에는 대부분 필수 지출과 고정비 중심으로 사용되고 있고, 가벼운 소비는 아직 많지 않습니다.\n\"카페\"나 \"간식\"처럼 기분 전환용 지출은 소량으로 등장하고 있어, 전반적으로는 안정된 흐름입니다.\n다만 기록이 더 쌓이면, 어느 카테고리에 조금 더 신경 써야 할지 더 분명하게 드러날 거예요."

- 예시 8:
  "지금까지의 기록을 보면, 특정 카테고리에 지출이 집중되기보다는 다양한 항목에 고르게 분산되어 있습니다.\n다만 \"카페\"·\"편의점\" 같은 작은 지출이 예상보다 높은 비율을 차지할 가능성이 있어 보여요.\n앞으로 일주일 정도만 이 부분을 유심히 지켜보면, 보다 정확한 소비 성향을 파악하는 데 도움이 됩니다."

- 예시 9:
  "이번 달 소비는 아직 초반 단계로, 몇 건의 지출만으로 전체 패턴을 단정하기는 이른 상태입니다.\n현재까지는 고정비를 제외하면, \"카페\"를 포함한 소액 사용이 한두 번 정도 기록되어 있습니다.\n이 상태에서는 특정 카테고리를 줄이기보다는, 충동적인 소비가 생기지 않도록 한 번 더 생각하고 사용하는 연습이 더 중요합니다."

- 예시 10:
  "이번 달에는 사용 횟수는 많지 않지만, 한 번 사용할 때마다 일정 금액 이상이 나가는 경향이 있습니다.\n특히 특정 카테고리가 한 번만 등장하더라도, 금액이 커서 체감상 부담이 클 수 있어요.\n같은 금액을 여러 번에 나누어 쓰기보다는, 꼭 필요한 지출인지 한 번 더 생각해 보는 것만으로도 소비 만족도가 올라갈 수 있습니다."

[challenge 예시 패턴들 (참고용)]
- 예시 1:
  "다음 주에는 지금까지처럼 큰 지출은 유지하되, 충동적으로 발생하는 소액 지출만 한두 번 덜 하는 것을 목표로 해보세요.\n지출 버튼을 누르기 전에 \"정말 필요한 사용인지\"를 한 번만 더 스스로에게 물어보는 것만으로도 충분한 시작이 됩니다."

- 예시 2:
  "다가오는 한 주 동안은 \"카페\"와 \"간식\"처럼 기분 전환용 소비를 의식적으로 살펴보는 것을 추천드립니다.\n예를 들어 일주일에 두 번 가던 카페를 한 번만 가보거나, 간식을 사기 전에 집에 있는 대체 음식이 있는지 먼저 확인해보세요."

- 예시 3:
  "다음 주에는 특정 카테고리를 줄이기보다는, 소비 기록 자체를 꾸준히 남기는 데 집중해보시는 건 어떨까요?\n매일 한 번씩 오늘의 지출을 정리하는 습관만 만들어도, 이후에 챌린지를 설계할 때 훨씬 수월해집니다."

- 예시 4:
  "아직 데이터가 많지 않은 만큼, 다음 주에는 \"충동 구매를 하루에 한 번만 참아보기\" 같은 작고 구체적인 목표를 잡아보세요.\n사고 싶은 물건이 생기면, 바로 결제하기보다는 10분 정도 시간을 두고 다시 한 번 생각해보는 연습을 해보시면 좋겠습니다."

- 예시 5:
  "다음 주에는 \"카페/편의점/간식\" 중에서 가장 자주 사용하는 한 가지를 골라, 사용 횟수를 이번 주보다 1~2회 줄여보는 목표를 세워보세요.\n무리해서 모두 줄이기보다는, 눈에 가장 먼저 띄는 카테고리 하나만 가볍게 조정해 보는 것이 꾸준히 실천하기에 훨씬 수월합니다."

- 예시 6:
  "다가오는 한 주 동안은, 필수 지출 외의 소비를 하기 전에는 항상 금액을 소리 내어 한 번 읽어보는 습관을 시도해보세요.\n금액을 인식하고 사용하면, 같은 소비라도 만족도는 높이고 불필요한 지출은 자연스럽게 줄이는 효과를 기대할 수 있습니다."

- 예시 7:
  "다음 주 목표는 \"기록을 빠짐없이 남기는 것\"과 \"하루에 한 번 이상 소비를 되돌아보는 것\" 두 가지에 두어 보세요.\n하루가 끝날 때 이번 주의 소비 중 가장 잘했다고 느낀 지출과 아쉬웠던 지출을 각각 하나씩만 떠올려 보는 것도 좋은 연습입니다."

- 예시 8:
  "만약 특정 요일, 특히 금요일이나 주말에 지출이 몰리는 경향이 보인다면, 이번 주에는 그날의 예산 상한선을 미리 정해두는 것을 추천드립니다.\n예를 들어 \"금요일 전체 지출을 40,000원 이내로 사용해보기\"처럼, 구체적인 숫자를 정해 두면 관리가 훨씬 쉬워집니다."

- 예시 9:
  "다음 주에는 고정비를 제외한 \"나를 위한 소비\"에 한 번 초점을 맞춰보세요.\n기분 전환을 위한 소비는 완전히 줄이기보다는, 정말 만족감을 주는 몇 가지에만 선택적으로 쓰는 방향으로 조정해보시면 좋겠습니다."

- 예시 10:
  "아직 소비 패턴이 완전히 드러난 상태는 아니므로, 다음 주에는 \"관찰 + 작은 조정\" 정도만 시도해보는 것이 좋습니다.\n기록을 꾸준히 남기면서, 한 주가 끝난 뒤에 어느 카테고리에서 가장 만족스러운 소비를 했는지 스스로 정리해 보는 것부터 시작해보세요."

입력 데이터:
- 연도/월: ${year}년 ${month}월
- FQ 점수: ${fqScore.toFixed(1)}점 (0~100점, 높을수록 바람직한 소비 패턴)
- 월간 총 지출: ${totalExpense.toLocaleString('ko-KR')}원
- 무지출일: ${noSpendDays}일 / ${totalDays}일
- 고액 단건 비율(참고용): ${highSingleText}
- 이번 달 지출 건수(expenseCount): ${typeof expenseCount === 'number' ? expenseCount : '알 수 없음'}건
- 지출이 있었던 날짜 수(activeDays): ${typeof activeDays === 'number' ? activeDays : '알 수 없음'}일
- 상위 카테고리:
${topCategories || '(카테고리 데이터 없음)'}`;
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

