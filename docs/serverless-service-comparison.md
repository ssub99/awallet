# AI 기능용 서버리스 서비스 선정 가이드

에이전트(AI 채팅 → 지출 기록 제안) 기능에서 **API 키 보관 + AI API 호출**용으로 쓸 서버리스 서비스를 비교합니다.

**전제**: 우리 서비스는 **React Native(Expo) 모바일 앱**(iOS/Android)이며, 앱에서 `fetch`로 서버리스 함수를 호출하는 구조입니다.  
Vercel·Cloudflare는 웹 호스팅으로 많이 알려져 있지만, **Edge/Worker 함수는 HTTP API**라서 모바일 앱에서 호출해도 동일하게 동작합니다. 모바일에는 부적합하다는 제약은 없습니다.

---

## 1. 후보 서비스

| 서비스 | 역할 | 비고 |
|--------|------|------|
| Firebase Cloud Functions | 함수 배포 → AI API 호출 | 이미 Firebase(사용성 데이터) 연동됨 |
| Vercel Edge Functions | 엣지에서 함수 실행 → AI API 호출 | 별도 Vercel 프로젝트 |
| Cloudflare Workers | 엣지에서 함수 실행 → AI API 호출 | 별도 Cloudflare 프로젝트 |

*(AWS Lambda는 설정이 무거워서 여기서는 생략.)*

---

## 2. 기준별 한눈에 비교

### 무료 플랜 사용량 (AI 프록시 = 요청 1건당 함수 1회 호출)

| 기준 | Firebase (Blaze 무료 한도) | Vercel (Hobby 무료) | Cloudflare (무료) |
|------|---------------------------|----------------------|-------------------|
| **호출 한도** | 월 **200만 회** | 월 **100만 회** (일 약 3.3만) | 일 **10만 회** (월 약 300만) |
| **실행 제한** | GB·CPU 초 한도 있음, AI 대기 가능 | 실행 시간·CPU 넉넉, AI 대기 가능 | 요청당 **CPU 10ms** (I/O 대기는 보통 미포함) |
| **결제 수단** | Blaze 전환 필요 (카드 등록) | 없이 사용 가능 | 없이 사용 가능 |
| **정리** | 호출 수 가장 많음, 무료 한도 내면 0원 | 호출·실행 모두 여유로움 | 호출 많음, CPU 10ms만 확인 필요 |

- **Firebase**: Blaze 플랜에서 월 200만 회 호출, 400K GB·초, 200K CPU·초까지 무료. 초과 시에만 과금.

### 계정·프로젝트 관리

| 기준 | Firebase | Vercel | Cloudflare |
|------|----------|--------|------------|
| **추가 계정** | 없음 (기존 Firebase) | Vercel 프로젝트 1개 | Cloudflare 계정 1개 |
| **배포** | `firebase deploy --only functions` | `vercel deploy` 또는 Git 연동 | `wrangler deploy` |
| **관리할 곳** | Firebase 콘솔 1곳 | Firebase + Vercel 대시보드 | Firebase + Cloudflare 대시보드 |

*“별도 프로젝트” = Vercel/Cloudflare를 쓰면 **대시보드·배포 흐름이 하나 더 생긴다**는 뜻입니다. 앱 코드(awallet 레포)는 하나만 두고, 함수 소스만 Vercel/Cloudflare에 배포하는 식으로 씁니다.*

### 국내 사용·자료

| 용도 | 더 자주 보이는 쪽 |
|------|-------------------|
| 웹/프론트(Next.js 등) | Vercel |
| **모바일/앱** *(우리 서비스)* | **Firebase** |
| 엣지 함수만 | Vercel (한글 자료·사례 많음) |
| Cloudflare Workers | 사용 사례 있으나, 1순위로 언급되는 빈도는 상대적으로 적음 |

---

## 3. 언제 뭘 쓸지 (추천 요약)

| 선택 | 추천 |
|------|------|
| **무료만 쓰고, 결제 수단 안 넣고 싶다** | **Vercel** (또는 Cloudflare, CPU 10ms만 확인) |
| **무료 한도는 넉넉하게, 이미 Firebase 쓴다** | **Firebase Blaze 무료 한도** (월 200만 회, 카드 등록 필요) |
| **관리할 곳을 하나로 모으고 싶다** | **Firebase** (사용성 데이터 + 함수 한 프로젝트) |
| **Firebase에 함수 두기 싫다** | **Vercel** 또는 **Cloudflare** |

---

## 4. 결론 및 다음 단계

- **무료 플랜 사용량**: Firebase(Blaze 무료 한도)가 **월 200만 회**로 가장 많고, Vercel 100만 회, Cloudflare는 일 10만 회(월 약 300만)이지만 CPU 10ms 제한 있음.
- **선정 후 할 일**
  1. 선택한 서비스에서 **함수 1개** 구현: `message`(+ 선택 `history`) 수신 → Gemini/Claude 호출 → JSON 반환
  2. 앱에서 해당 함수 URL로 `fetch` (API 키는 앱에 두지 않음)
  3. (선택) 환경별 URL 관리 (스테이지/프로덕션)

실제 비용·한도는 각 서비스 최신 요금표를 확인하는 것이 좋습니다.
