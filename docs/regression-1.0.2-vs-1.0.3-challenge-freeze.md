# 회귀 분석: 1.0.2(5) 정상 vs 1.0.3(7) 챌린지 탭 멈춤

## 요약

- **정상**: 스테이지 빌드 1.0.2(5) — 챌린지 생성/수정/삭제 후 이동 시 앱 정상 동작
- **이상**: 스테이지 빌드 1.0.3(7) 이후 — 챌린지 탭으로 돌아올 때 앱 멈춤

## 커밋 기준

| 버전 | 앱 버전 / 번들 | 커밋 | 비고 |
|------|----------------|------|------|
| 정상 | 1.0.2 (5) | `d96b86e` | OTA runtimeVersion 1.0.2, stage-testflight |
| 이상 | 1.0.3 (7) | `7eeae04` | 간편입력 1.0.3 버전 게이트, 앱 1.0.3/번들 32 |

비교 범위: `d96b86e` (1.0.2) → `7eeae04` (1.0.3) 사이 커밋/변경사항.

---

## 1. 구조 차이 (탭·화면)

### 1.0.2 (정상)

- **탭 구성**: home · **create(기록하기)** · mypage  
- **챌린지 전용 탭 없음**. 챌린지는 “월 소비 타임라인” 화면 안의 **챌린지 탭**으로만 진입.
- `app/(tabs)/challenge.tsx` **파일 없음**.

### 1.0.3 (이상)

- **탭 구성**: home · **challenge(챌린지)** · mypage  
- create는 `href: null` 로 탭바에서 숨김.
- **새 파일**: `app/(tabs)/challenge.tsx` (661줄) — 챌린지 전용 탭 화면.

---

## 2. 챌린지 생성/수정 완료 후 이동 방식

### 1.0.2 (정상)

```text
챌린지 생성 완료
  → router.back()
  → 100ms 후 router.replace({
       pathname: '/monthly-expense-timeline',
       params: { year, month, tab: 'challenge' }
     })
```

- 이동 대상: **월 소비 타임라인** 화면의 **챌린지 탭**.
- `navigation.reset` 없음. 백 후 다른 화면으로 replace.

### 1.0.3 (이상)

```text
챌린지 생성/수정/삭제 완료
  → (navigation as any).reset({
       index: 0,
       routes: [{
         name: '(tabs)',
         params: { screen: 'challenge', params: { year, month } }
       }]
     })
```

- 이동 대상: **탭 스택 초기화 후 챌린지 탭** 직접 진입.
- create/edit 스크린이 스택에서 제거되고, **같은 틱에** 챌린지 탭이 마운트·포커스됨.

---

## 3. 챌린지 탭 진입 시 무거운 로직 (1.0.3만 해당)

`app/(tabs)/challenge.tsx` 가 포커스될 때:

1. **useFocusEffect** → `refreshData()` 호출
2. **refreshData**  
   - `loadMonthStartDay()`  
   - `getChallengesByDateRange()`  
   - `setChallenges(activeChallenges)`  
   - `setIsContentReady(true)` 등
3. **useEffect([challenges])** → `calculateChallengeAmounts()`  
   - `AsyncStorage.getItem('calendarData')` 로 **전체 캘린더 데이터** 조회  
   - `JSON.parse(storedData)`  
   - **모든 날짜 키**에 대해 루프로 챌린지별 소비 합계 계산  
   - `setChallengeAmounts(amounts)`

이 흐름이 **create/edit 언마운트(BlurView, CustomKeypad, 애니메이션 정리 등)와 동시에** 일어나며, 메인 스레드에서 동기적으로 무거운 작업이 겹침.

---

## 4. 회귀 원인 정리

| 요인 | 1.0.2 | 1.0.3 |
|------|--------|--------|
| 챌린지 전용 탭 | 없음 | 있음 (`challenge.tsx`) |
| 완료 후 이동 | `router.back()` + `replace(monthly-expense-timeline, tab: 'challenge')` | `navigation.reset()` → 챌린지 탭 직접 |
| 무거운 연산 | 월 소비 타임라인 내부 탭 전환 수준 | 챌린지 탭 마운트 + useFocusEffect + refreshData + **전체 calendarData 파싱·루프** |
| 타이밍 | 백 후 100ms 지연 후 replace | reset 직후 즉시 챌린지 탭 마운트·포커스 |

**결론**:  
1.0.3에서 **챌린지 전용 탭 추가**와 **완료 후 `navigation.reset()`으로 해당 탭 직행**으로 바뀌면서, **reset 직후 챌린지 탭이 포커스될 때 실행되는 무거운 로직(useFocusEffect → refreshData → setChallenges → useEffect → calculateChallengeAmounts)** 이 create/edit 언마운트와 같은 타이밍에 겹쳐, 메인 스레드 블로킹 또는 React commit/네이티브 레이아웃 단계에서 앱이 멈추는 것으로 추정됨.

1.0.2에서는 챌린지 전용 탭이 없고, 이동도 “월 소비 타임라인 + 탭 전환”이라 같은 무거운 연산이 같은 타이밍에 겹치지 않았을 가능성이 큼.

---

## 5. 관련 커밋 (1.0.2 → 1.0.3 구간)

- `7a34359` — 챌린지 탭 네비게이션·키패드·중복 체크 마무리  
- `da84c16` — 챌린지 생성·수정 키패드 닫기 동작 정교화  
- `023721d` — 홈 탭 간편입력·월 현황 UI 반영  
- `7eeae04` — 간편입력 1.0.3 버전 게이트, 앱 버전 1.0.3/번들 32  

챌린지 탭 파일 추가 및 `_layout.tsx` 에 challenge 탭 반영은 위 구간 내에서 이루어짐.

---

## 6. 권장 대응 방향 (요약)

1. **챌린지 탭 unmount 시**  
   - 애니메이션·리소스 정리(cleanup) 추가 — 기능 변경 없이 정리만.
2. **reset 직전**  
   - 키패드 먼저 닫고, 짧은 지연(예: requestAnimationFrame 또는 50ms) 후 `navigation.reset()` 호출 — “기능 변경”이 아니라 전환 타이밍만 분리.
3. **calculateChallengeAmounts**  
   - `InteractionManager.runAfterInteractions` 또는 작은 청크/지연으로 메인 스레드 부하 분산.

위는 이전 대화에서 논의한 “기능은 그대로, 타이밍/정리만 조정” 방향과 동일함.
