# Vercel 도입 절차 (에이전트 API)

에이전트용 서버리스 함수를 Vercel에 배포하기 위해 필요한 단계입니다.

---

## 1. 해야 할 일 요약

| 순서 | 할 일 | 담당 |
|------|--------|------|
| 1 | Vercel 계정 생성 / 로그인 | 사용자 |
| 2 | 프로젝트를 Vercel에 연결 (Git 또는 CLI) | 사용자 |
| 3 | 환경 변수 `awallet_gemini_api` 설정 (Preview 포함) | 사용자 |
| 4 | 배포 후 함수 URL 확인 | 사용자 |
| 5 | (선택) 빌드 스킵 설정 | 사용자 |

---

## 2. Vercel 계정·프로젝트 연결

### 2-1. 계정

- [vercel.com](https://vercel.com) 에서 가입 또는 로그인 (GitHub 등으로 연동 가능).

### 2-2. 이 레포를 Vercel 프로젝트로 연결

**방법 A: Git 연동 (추천)**

1. Vercel 대시보드 → **Add New** → **Project**
2. GitHub/GitLab 등에서 **awallet** 저장소 선택
3. **Root Directory**는 비워두고, **Framework Preset**은 "Other" 또는 "Expo" 선택
4. (아래 3번에서) 환경 변수 추가 후 **Deploy**

**방법 B: CLI로 배포**

```bash
# 프로젝트 루트(awallet)에서
npx vercel login
npx vercel
# 프롬프트에 따라 프로젝트 연결 후 배포
# 프로덕션: npx vercel --prod
```

---

## 3. 환경 변수 설정 (필수)

### 3-1. Gemini API 키 발급 (Google AI Studio)

1. **[Google AI Studio](https://aistudio.google.com/app/apikey)** 접속
2. **Google 계정**으로 로그인
3. **Create API key** (또는 "API 키 만들기") 클릭
4. 프로젝트 선택 후 생성 → **키 값**이 나오면 복사해 두기 (한 번만 표시되는 경우 있음)
5. (선택) 무료 한도·과금 알림은 같은 화면 또는 [Google AI for Developers](https://ai.google.dev/)에서 확인

### 3-2. Vercel에 키 넣기

1. Vercel 대시보드 → 해당 프로젝트 → **Settings** → **Environment Variables**
2. 추가:
   - **Name**: `awallet_gemini_api` (정확히 이 이름 사용)
   - **Value**: 위에서 복사한 API 키
   - **Environment**: **Preview** 와 **Production** 둘 다 체크 (ing 등 브랜치 URL은 Preview라서 Preview 체크 필수)
3. 저장 후 **재배포** 한 번 실행 (환경 변수 반영).

**재배포 방법 (둘 중 하나):**

- **방법 A (대시보드):** **Deployments** 탭 → 맨 위(최신) 배포 오른쪽 **⋯** 메뉴 → **Redeploy** → **Redeploy** 버튼 클릭
- **방법 B (Git 푸시):** 아무 변경이나 커밋해서 **연결된 브랜치**에 푸시하면 자동으로 새 배포가 뜸

**404가 뜨는 경우 점검:**

1. **루트(/)만 열어서 404인지:** Vercel **Visit** 버튼은 보통 `https://프로젝트.vercel.app/` (루트)를 엽니다. 이 프로젝트는 **API만** 있어서 루트에는 페이지가 없고, **`/api/parse-expense`** 에만 동작합니다. 루트에서 404는 정상입니다. → **POST** `https://프로젝트.vercel.app/api/parse-expense` 로 테스트하세요 (curl 또는 Postman).
2. **배포 브랜치에 api 폴더가 없을 때:** Vercel이 배포하는 브랜치(예: master)에 **api/** 폴더와 **vercel.json** 이 포함된 커밋이 푸시되어 있어야 합니다. `api/` 를 넣은 커밋이 **ing** 등 다른 브랜치에만 있으면, master 배포에는 API가 없어서 `/api/parse-expense` 도 404가 납니다. → **api/** 와 **vercel.json** 이 들어 있는 커밋을 **Production Branch**(예: master)에 푸시하거나 머지한 뒤 재배포하세요.

**`awallet_gemini_api not configured` 가 나올 때:**

1. **Preview 환경에 변수가 있는지 확인:** `ing` 브랜치 URL(`...-git-ing-...vercel.app`)은 **Preview** 배포입니다. **Settings → Environment Variables**에서 `awallet_gemini_api` 가 **Preview** 에 체크되어 있어야 합니다. (Production만 체크돼 있으면 Preview URL에서는 빈 값으로 나옵니다.)
2. **이름 정확히 `awallet_gemini_api`** 인지 확인 (띄어쓰기 없음, 소문자).
3. 저장 후 **Deployments** → 해당 배포 **⋯** → **Redeploy** 로 한 번 다시 배포.

**테스트 단계에서 `ing` 브랜치로만 배포하고 싶을 때:**

1. 로컬에서 마지막 커밋까지 한 뒤 `ing` 브랜치에 푸시: `git push origin ing`
2. Vercel은 **Settings → Git → Production Branch** 에서 정한 브랜치만 “프로덕션 URL”로 배포함. 나머지 브랜치 푸시는 **Preview** 배포(브랜치별 URL)로 뜸.
3. 따라서 `ing` 에 푸시하면:
   - **Production Branch 가 `ing` 이면** → `https://awallet.vercel.app` 에 배포됨 (테스트용으로 쓰면 됨)
   - **Production Branch 가 `main`/`master` 등이면** → `ing` 푸시는 **Preview** 배포만 생성 (예: `https://awallet-git-ing-xxx.vercel.app`) → 메인 URL은 안 바뀜
4. **`ing` 푸시가 메인 URL에 반영되게 하려면:** **Production Branch** 를 **ing** 으로 바꾸고 저장. 그다음부터는 `ing` 푸시가 프로덕션 배포로 뜨고, 메인 도메인이 그걸 가리킴.
   - **Production Branch 위치:** 프로젝트 **Settings** → **Git** 페이지에서 **Deploy Hooks가 아닌 위쪽**에 “Production Branch” 또는 “Production branch” 필드가 있음. 없으면 **Settings** → **Environments** 메뉴에서 같은 설정을 찾을 수 있음 (Vercel UI 버전에 따라 다름).
5. **Deploy Hooks** 는 “이 URL로 GET 요청 보내면 해당 브랜치 배포 트리거”하는 기능이라, “어떤 브랜치 푸시가 프로덕션으로 갈지” 정하는 **Production Branch** 와는 다름.
6. 정리: **디폴트 브랜치만 보는 게 아니라**, “프로덕션으로 쓸 브랜치”를 하나 정해 두는 것. 그걸 `ing` 으로 바꾸면 `ing` 푸시가 메인 URL에 배포됨.

### 3-3. 스테이지 / 프로덕션 환경 나누기

**필수는 아닙니다.** 하나의 URL·하나의 API 키만 써도 됩니다.

나누고 싶다면 두 가지 방식이 있습니다.

| 방식 | 설명 |
|------|------|
| **같은 프로젝트, 환경만 구분** | Vercel **Environment Variables**에서 **Production** / **Preview** 를 따로 선택해 넣기. `main` 배포 = Production URL, 다른 브랜치 배포 = Preview URL. 스테이지 앱은 Preview URL을, 프로덕션 앱은 Production URL을 쓰면 됨. |
| **프로젝트 두 개** | Vercel 프로젝트를 **awallet-stage**, **awallet**(프로덕션) 처럼 두 개 만든 뒤, 스테이지 앱은 `https://awallet-stage.vercel.app/api/parse-expense`, 프로덕션 앱은 `https://awallet.vercel.app/api/parse-expense` 처럼 다른 URL 호출. |

- **같은 프로젝트**: 관리할 곳이 하나라서 단순함. Preview 배포 시 자동으로 브랜치별 URL이 생김.
- **프로젝트 두 개**: 스테이지/프로덕션을 완전히 분리하고 싶을 때. API 키도 스테이지용·프로덕션용 따로 둘 수 있음.

---

## 4. 배포 후 확인

- 배포가 끝나면 **Deployments**에서 URL 확인 (예: `https://awallet-xxx.vercel.app`).
- 에이전트 API 엔드포인트:
  - **POST** `https://<프로젝트-도메인>/api/parse-expense`

### 4-1. API URL을 `https://awallet.vercel.app/api/parse-expense` 로 쓰고 싶을 때

1. **Vercel 대시보드** → 우리 프로젝트 선택 → **Settings** → **General**
2. **Project Name** 입력란을 찾아서 **awallet** 로 입력 (이미 있으면 그대로 둠)
3. **Save** 하면 기본 배포 URL이 `https://awallet.vercel.app` 로 잡힘
4. 그러면 API 주소는 **`https://awallet.vercel.app/api/parse-expense`** 가 됨

**참고:** `awallet` 이 이미 다른 계정에서 쓰 중이면 이 이름은 쓸 수 없음. Project Name을 **awallet-vercel-api** 로 두면 API 주소는 **`https://awallet-vercel-api.vercel.app/api/parse-expense`** 가 됨.
- 요청 body 예시:
  ```json
  { "message": "어제 오늘 점심 2만원 썼어" }
  ```
- (선택) 대화 이력 전달:
  ```json
  {
    "message": "그건 식비로",
    "history": [
      { "role": "user", "content": "어제 점심 2만원" },
      { "role": "assistant", "content": "..." }
    ]
  }
  ```

---

## 5. (선택) 빌드 스킵

Expo 프로젝트는 웹 빌드 결과가 없을 수 있어, Vercel이 빌드 단계에서 실패할 수 있습니다.

- **Settings** → **General** → **Build & Development Settings**
- **Ignored Build Step**에 아래 입력 후 저장:
  ```bash
  exit 0
  ```
- 그러면 빌드는 건너뛰고, **api/** 폴더의 서버리스 함수만 배포됩니다.

---

## 6. 앱에서 호출 예시

배포된 URL을 앱의 환경 변수 또는 상수로 두고:

```typescript
const res = await fetch('https://<your-vercel-url>/api/parse-expense', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '어제 점심 2만원', history: [] }),
});
const data = await res.json();
// data.records, data.suggestedCategory
```

---

## 7. 정리

- **Vercel 도입** = 계정 생성 → 프로젝트 연결 → `GEMINI_API_KEY` 설정 → 배포 → `/api/parse-expense` URL 사용.
- 코드는 이미 **api/parse-expense.ts**, **vercel.json** 에 반영되어 있으므로, 위 절차만 진행하면 됩니다.
