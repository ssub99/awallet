# 증상 포착 QA 절차 (증거 기반 디버깅)

재현·원인 파악이 어려운 증상을 **추측 대신 증거로** 잡아내는 공통 절차다. 기능·영역을 가리지 않는다.
룰: `.cursor/rules/19-symptom-capture-qa.mdc`

## 폴더 구조

```text
qa/
  README.md          # 이 문서 (절차)
  scripts/           # 재사용 도구 — 커밋
    frames.swift     #   영상 → 프레임 추출
    sheet.swift      #   프레임 → 한 장짜리 시트
  captures/          # 조사 결과물 — .gitignore (커밋 제외)
    recordings/      #   녹화 영상
    frames/          #   추출 프레임·시트
    dumps/           #   기기 저장소 덤프
    logs/            #   logcat·시뮬레이터 로그
```

- `captures/` 하위 폴더는 미리 만들어 두지 않는다. 비어 있는 폴더는 git이 추적하지 않으므로, 절차대로 쓸 때 필요한 폴더만 생성된다 (`mkdir -p`, `frames.swift`가 자동 생성).
- 조사가 끝나면 `qa/captures/`를 통째로 비운다.
- 결과물을 루트나 다른 폴더에 만들지 않는다.

## 0. 공통 흐름

```text
문제 구간 확인 → 재현 조건 확인 → 증거 수집 → 증거 ↔ 코드 흐름 대응 → 수정 → 같은 방법으로 재검증 → 정리
```

| 단계 | 핵심 |
|---|---|
| 문제 구간 확인 | 플랫폼·빌드, 화면, 조작, **증상이 보이는 시점** (예: "다 올라온 뒤 한 번 튐") |
| 재현 조건 확인 | 데이터·설정·저장값을 기기에서 직접 읽는다. "켜져 있겠지"를 가정하지 않는다 |
| 증거 수집 | 증상 유형별 도구 (아래 표) |
| 원인 확정 | 관찰한 순서·값을 코드 실행 순서(상태 커밋, effect, 비동기 콜백, 네이티브 이벤트)에 1:1로 맞춘다 |
| 재검증 | 수정 전과 **같은 조건·같은 방법**으로 다시 수집해 비교한다 |
| 정리 | `qa/captures/` 비우기, 기기 내 녹화 삭제, 진단용 코드(`console.log`, `'use no memo'` 등) 제거 |

## 1. 증상 유형별 도구

| 증상 유형 | 예시 | 증거 수집 방법 |
|---|---|---|
| 시각 (모션·레이아웃) | 튐, 깜빡임, 순간이동, 잘림 | 화면 녹화 → 프레임 추출 (§2) |
| 상태·데이터 | 저장 안 됨, 개수 불일치, 설정 무시 | 저장소 덤프 (§3) |
| 런타임·비동기 | 순서 꼬임, 중복 실행, 경고·에러 | 로그 (§4) |
| 네이티브·크래시 | 앱 종료, 네이티브 모듈 오류 | 네이티브 로그 (§4) |
| 회귀 | "예전엔 됐는데" | bisect (§5) |

증상이 여러 유형에 걸치면 함께 쓴다. (예: 녹화로 시점을 잡고 로그로 그 시점의 실행 순서 확인)

## 2. 화면 녹화 → 프레임 분석

### 녹화하면서 조작 재현

**Android (실기기·에뮬레이터)**

```bash
mkdir -p qa/captures/recordings qa/captures/frames
adb exec-out screencap -p > qa/captures/frames/screen.png   # 좌표 확인용 (실제 해상도: adb shell wm size)
(adb shell screenrecord --time-limit 4 --bit-rate 12000000 /sdcard/qa.mp4 &)
sleep 1.0                                                    # 녹화 시작 대기
adb shell input tap <x> <y>                                  # 조작 재현 (swipe: input swipe x1 y1 x2 y2 ms)
sleep 4.0
adb pull /sdcard/qa.mp4 qa/captures/recordings/qa.mp4 && adb shell rm -f /sdcard/qa.mp4
```

**iOS 시뮬레이터**

```bash
mkdir -p qa/captures/recordings
xcrun simctl io booted recordVideo qa/captures/recordings/qa.mp4   # Ctrl+C로 종료
xcrun simctl io booted screenshot qa/captures/frames/screen.png
```

iOS 실기기는 자동 탭이 어려우므로 사용자에게 QuickTime(파일 → 새로운 동영상 녹화 → 기기 선택) 또는 기기 화면 기록으로 녹화를 요청하고, 받은 영상을 `qa/captures/recordings/`에 둔다.

> 에이전트 샌드박스에서 `adb shell input`이 막히면 전체 권한으로 실행한다.

### 프레임 추출·시트 (ffmpeg 불필요)

```bash
# 0.5~3.5초 구간을 17ms 간격으로, 화면 세로 40%부터 45% 높이만 크롭
swift qa/scripts/frames.swift qa/captures/recordings/qa.mp4 qa/captures/frames/run1 0.5 3.5 0.017 0.40 0.45

# 프레임 여러 장 → 6열 시트 한 장
swift qa/scripts/sheet.swift qa/captures/frames/run1-overview.png $(ls qa/captures/frames/run1/*.png | awk 'NR%3==1')
```

- 실패한 시각은 `skip <초>: <이유>`로 출력되고, 마지막 줄에 `저장/시도` 개수가 나온다.
- `Cannot Decode` → 에이전트 샌드박스가 디코더를 막은 것이므로 전체 권한으로 실행한다.
- `Cannot Open` → 영상 길이를 벗어난 구간이다. Android `screenrecord`는 화면이 바뀔 때만 프레임을 기록하므로 정지 화면만 찍히면 영상이 매우 짧다. 녹화 중에 조작을 재현해야 한다.

### 보는 순서

1. **개요** — 약 50ms 간격(3프레임마다)으로 시트를 만들어 변화가 생기는 구간을 찾는다.
2. **확대** — 의심 구간을 17ms 간격으로 한 프레임씩 본다. 증상 영역만 크롭하면 차이가 잘 보인다.
3. **기록** — 시각과 함께 위치·크기·투명도·내용 변화를 적는다.
   예: `1.587s 정상 → 1.604~1.621s 좌우 여백 증가·약 12px 하강 → 1.638s 복귀`
4. 같은 파일명으로 덮어쓰면 이전 이미지가 보일 수 있으니 시트 파일명을 매번 바꾼다 (`run1`, `run2` …).

## 3. 저장소 덤프 (상태·데이터)

**Android 개발 빌드 AsyncStorage**

```bash
PKG=com.ssong.awallet.stage   # production: com.ssong.awallet
mkdir -p qa/captures/dumps
adb exec-out "run-as $PKG cat databases/RKStorage" > qa/captures/dumps/RKStorage
adb exec-out "run-as $PKG cat databases/RKStorage-journal" > qa/captures/dumps/RKStorage-journal
sqlite3 qa/captures/dumps/RKStorage "select key, substr(value,1,300) from catalystLocalStorage where key like '%<키워드>%'"
```

**iOS 시뮬레이터 AsyncStorage**

```bash
DATA=$(xcrun simctl get_app_container booted com.ssong.awallet data)
ls "$DATA/Library/Application Support/"*/RCTAsyncLocalStorage_V1/
```

실행 중인 앱 확인: `adb shell dumpsys activity activities | rg -m1 mResumedActivity`

## 4. 로그 (런타임·네이티브)

로그를 파일로 남길 때는 `qa/captures/logs/`에 저장한다.

| 대상 | 명령 |
|---|---|
| JS 로그 (Android) | `adb logcat -s ReactNativeJS:V` |
| 네이티브·크래시 (Android) | `adb logcat -b crash` / `adb logcat \| rg -i "<패키지>\|FATAL"` |
| JS 로그 (공통) | Metro 터미널 출력 |
| iOS 시뮬레이터 | `xcrun simctl spawn booted log stream --predicate 'process == "<앱 이름>"'` |

순서 문제를 볼 때는 진단용 로그에 `performance.now()` 등 타임스탬프를 붙여 녹화 프레임 시각과 맞춘다. 확인 후 반드시 제거한다.

## 5. 회귀 확인 (bisect)

최근 작업이 원인인지 불명확하면 관련 파일만 작업 전 커밋으로 임시 되돌려 같은 조건으로 재현한다.

```bash
git log --follow --format="%h %ad %s" --date=short -- <파일>   # 이력 (이름 변경 포함)
git stash push -m "diag" -- <미커밋 파일>
git checkout <작업 전 커밋> -- <관련 파일들>
# 재현 확인 후 원복
git checkout HEAD -- .
git stash pop
```

- 원복 후 `git status`로 확인한다. 삭제됐던 파일이 `A`(staged)로 남으면 `git rm --cached` 후 파일도 지운다.
- 되돌려도 증상이 같으면 최근 작업은 원인이 아니다 → 더 이전 커밋으로 범위를 넓힌다.

## 6. 정리 체크리스트

- [ ] `rm -rf qa/captures` — 결과물 통째로 비우기
- [ ] 기기 내 녹화 파일 삭제 (`adb shell rm -f /sdcard/qa.mp4`)
- [ ] 진단용 코드 제거
- [ ] 효과 없던 변경 되돌림
- [ ] `git status`로 의도한 변경만 남았는지 확인
