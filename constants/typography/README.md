# Typography (`constants/typography`)

Figma 텍스트 스타일(`body01`, `headline01` …)과 코드 API 이름이 같습니다.

## 파일 읽는 순서

| 순서 | 파일 | 내용 |
|------|------|------|
| 1 | `typography.base.ts` | fontSize, `font_weights`, Input 박스 높이 |
| 2 | `typography.platform.ts` | **iOS / Android** lineHeight (paragraph · uiLine · fieldInput) |
| 3 | `merge.ts` | `Platform.OS` 분기는 **여기만** — 스타일 factory |
| 4 | `typography-tree.ts` | `typography.body01.regular` (화면용) |
| 5 | `layout.ts` | `typographyLayout.*` (fieldInput · uiLine · 휠) |

## 맥락 3가지 (lineHeight가 달라지는 이유)

| 맥락 | 용도 | factory / preset |
|------|------|------------------|
| **paragraph** | 일반 `Text`, 여러 줄 | `createTypographyStyle` → `typography.*` |
| **uiLine** | 버튼·탭·칩·폼 행 `Text` 등 고정 높이 한 줄 | `uiLineTextStyle` → `typographyLayout.uiLineBody01Regular` 등 |
| **fieldInput** | `TextInput`, placeholder, wrap | `createFieldInputTypographyStyle` → `typographyLayout.fieldInputLine` |

같은 `body01`이라도 Android **uiLine**는 paragraph와 lineHeight가 다를 수 있습니다. 숫자는 `typography.platform.ts`에서 ios/android를 나란히 확인하세요.

## `typographyLayout` 키 규칙 (동결)

- **접두사 = 맥락**: `uiLine*` · `fieldInput*` · `pickerNav*` · `card*` · `categoryEmoji*` · `spinnerWheel*` · `pickerWheel*`
- **uiLine 패턴**: `uiLine` + `{Figma토큰}` + `{Weight}` — 예: `uiLineBody01Medium`, `uiLineButton02Regular`
- **fieldInput 패턴**: `fieldInput` + `{역할}` — 예: `fieldInputLine`, `fieldInputPlaceholder`, `fieldInputLineWrap`
- **같은 uiLine 메트릭이면 키 하나** — 컴포넌트명(`tabText*`, `buttonText*`)으로 새 키 만들지 않음
- **본문만 필요하면** `typography.body01.*` — paragraph 복제 최소화
- **가로 축소** — `monthStatusAmount` / `calendarAmount` + `scaleTextStyleFontSize`
- **기존 키 rename 금지** — 새 맥락만 키 추가

`uiLineTextStyle`은 `constants/typography/` 밖에서 호출하지 않습니다.

## 화면에서 쓰는 API (최종형)

`app/*` 화면은 아래 **공개 wrapper**를 사용합니다. 토큰 매핑은 `components/ui/app-text.tsx`(`AppText`) 한 곳에서 처리합니다.

```tsx
// 섹션 제목 (semantic role)
<SectionTitle>기본 정보</SectionTitle>

// 한 줄 UI 텍스트 (uiLine)
<UiLineText variant="body01Regular">삭제</UiLineText>

// Input 맥락 표시 텍스트 (fieldInput)
<FieldInputText variant="number">12,000</FieldInputText>

// 피커 네비게이션 (pickerNav)
<PickerNavText variant="medium">확인</PickerNavText>

// 카드 텍스트 (card)
<CardText variant="title">식비</CardText>

// 카테고리 이모지 (categoryEmoji)
<CategoryEmojiText variant="medium">🍔</CategoryEmojiText>

// 여러 줄 본문 (paragraph) — typographyLayout 금지 범위 밖
<Text style={typography.body01.regular} />
```

### AppText SSOT

```
[app 화면]  SectionTitle / UiLineText / CategoryEmojiText / …
              ↓ thin wrapper (components/ui/*-text.tsx)
[SSOT]      AppText (context + variant → typographyLayout / typography)
              ↓
[토큰]      typographyLayout.* / typography.*
```

- **화면 개발자**: context wrapper 이름만 선택 (`UiLineText`, `CardText` …)
- **DS 유지보수**: variant map 수정은 `app-text.tsx`만 변경
- **`AppText` 직접 사용**: `components/ui/` 내부 또는 wrapper 구현에서만 (화면 `app/*`에서는 wrapper 권장)
- `Button`/`Tab`/`Input`은 기존처럼 내부에서 `typographyLayout` 처리

`typographyScale`, `getPlatformTypographySizes` 등은 내부/동적 축소용입니다.

## Guardrail

- `eslint.config.js`에 `app/**/*.tsx` 전역 규칙을 적용했습니다.
- 모든 화면에서 `typographyLayout.uiLine*` / `fieldInput*` / `pickerNav*` / `card*` / `categoryEmoji*` 직접 접근을 금지합니다.
- 권장 경로 (모두 `AppText` thin wrapper):
  - 섹션 타이틀: `SectionTitle`
  - 한 줄 UI 텍스트: `UiLineText`
  - 입력 계열: `Input` / `FieldInputText` / `FieldInputLineWrap`
  - 피커 네비게이션: `PickerNavText`
  - 카드 텍스트: `CardText`
  - 카테고리 이모지: `CategoryEmojiText`
