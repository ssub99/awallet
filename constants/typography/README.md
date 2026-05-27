# Typography (`constants/typography`)

Figma 텍스트 스타일(`body01`, `headline01` …)과 코드 API 이름이 같습니다.

## 파일 읽는 순서

| 순서 | 파일 | 내용 |
|------|------|------|
| 1 | `typography.base.ts` | fontSize, `font_weights`, Input 박스 높이 |
| 2 | `typography.platform.ts` | **iOS / Android** lineHeight (paragraph · singleRow · fieldInput) |
| 3 | `merge.ts` | `Platform.OS` 분기는 **여기만** — 스타일 factory |
| 4 | `typography-tree.ts` | `typography.body01.regular` (화면용) |
| 5 | `layout.ts` | `typographyLayout.*` (Input · 한 줄 UI · 휠) |

## 맥락 3가지 (lineHeight가 달라지는 이유)

| 맥락 | 용도 | factory / preset |
|------|------|------------------|
| **paragraph** | 일반 `Text`, 여러 줄 | `createTypographyStyle` → `typography.*` |
| **singleRow** | 버튼·탭·칩 등 고정 높이 한 줄 | `singleRowCenteredTextStyle` → `typographyLayout.buttonTextLarge` 등 |
| **fieldInput** | `TextInput` | `createFieldInputTypographyStyle` → `typographyLayout.fieldLineInput` |

같은 `body01`이라도 Android **singleRow**는 paragraph와 lineHeight가 다를 수 있습니다. 숫자는 `typography.platform.ts`에서 ios/android를 나란히 확인하세요.

## 화면에서 쓰는 API

```tsx
// Figma Body/01 Regular
<Text style={typography.body01.regular} />

// Input 한 줄
<TextInput style={typographyLayout.fieldLineInput} />

// 버튼 라벨 (singleRow)
<Text style={typographyLayout.buttonTextLarge} />
```

`typographyScale`, `getPlatformTypographySizes` 등은 내부/동적 축소용입니다. 일반 화면은 `typography` / `typographyLayout`만 사용합니다.
