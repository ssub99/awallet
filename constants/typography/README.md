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

- **접두사 = 맥락**: `uiLine*` · `fieldInput*` · `pickerNav*` · `card*` · `spinnerWheel*` · `pickerWheel*`
- **uiLine 패턴**: `uiLine` + `{Figma토큰}` + `{Weight}` — 예: `uiLineBody01Medium`, `uiLineButton02Regular`
- **fieldInput 패턴**: `fieldInput` + `{역할}` — 예: `fieldInputLine`, `fieldInputPlaceholder`, `fieldInputLineWrap`
- **같은 uiLine 메트릭이면 키 하나** — 컴포넌트명(`tabText*`, `buttonText*`)으로 새 키 만들지 않음
- **본문만 필요하면** `typography.body01.*` — paragraph 복제 최소화
- **가로 축소** — `monthStatusAmount` / `calendarAmount` + `scaleTextStyleFontSize`
- **기존 키 rename 금지** — 새 맥락만 키 추가

`uiLineTextStyle`은 `constants/typography/` 밖에서 호출하지 않습니다.

## 화면에서 쓰는 API

```tsx
// Figma Body/01 Regular (paragraph)
<Text style={typography.body01.regular} />

// TextInput 한 줄
<TextInput style={typographyLayout.fieldInputLine} />

// 폼 행 표시 Text / 탭·버튼 라벨 (uiLine)
<Text style={typographyLayout.uiLineBody01Regular} />
<Text style={typographyLayout.uiLineButton01Medium} />

// 피커 상단 (uiLine 메트릭, picker 접두)
<Text style={typographyLayout.pickerNavMedium} />
```

`typographyScale`, `getPlatformTypographySizes` 등은 내부/동적 축소용입니다. 일반 화면은 `typography` / `typographyLayout`만 사용합니다.
