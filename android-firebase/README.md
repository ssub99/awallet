# Android Firebase 설정 (소스)

iOS `ios/awallet/GoogleService-Info.plist`와 같은 **원본** 위치입니다.

- **파일:** `google-services.json` (Firebase Console → Android 앱 `com.ssong.awallet`)
- **연결:** `app.json` → `expo.android.googleServicesFile`
- **Stage:** iOS와 같이 **동일 Firebase 프로젝트**를 쓰되, Android 패키지 `com.ssong.awallet.stage`는 Console에 **별도 Android 앱**으로 등록한 뒤 `google-services.json`의 `client` 배열에 항목이 추가되어야 stage flavor 빌드(`:app:assembleStageRelease` 등)가 통과할 수 있습니다. (production만 있으면 `processStage*GoogleServices` 단계에서 실패할 수 있음.)

`npx expo prebuild -p android` 실행 시 `android/app/google-services.json`으로 복사됩니다.  
`android/app/` 안의 json은 **직접 수정하지 마세요** (prebuild가 덮어씀).

`prebuild --clean`은 `android/` 폴더를 지우므로, 원본은 반드시 이 디렉터리에 유지합니다.

## Android Studio: `Cannot run program "node"`

Gradle sync 시 위 오류가 나면 Android Studio가 **PATH에 node를 못 찾는** 경우입니다 (flavor 설정과 무관). `expo-autolinking-settings` 플러그인도 bare `node`를 호출합니다.

1. 터미널에서 `which node` 로 경로 확인 (예: `/usr/local/bin/node`)
2. `android/local.properties.example` → `android/local.properties` 복사 후 `node.executable=` 에 그 경로 입력
3. `chmod +x android/tools/node` (최초 1회, Git clone 후 실행 권한이 없을 때)
4. Android Studio: **Settings → Build Tools → Gradle → Gradle wrapper** 사용 확인
5. 터미널: `cd android && ./gradlew --stop` 후 Android Studio **Sync**
6. Android Studio에서 **`android` 폴더**를 프로젝트 루트로 열었는지 확인 (상위 `awallet`만 열면 `.idea/gradle.xml` PATH가 어긋날 수 있음)
7. 그래도 안 되면 **Settings → Build Tools → Gradle → Environment variables** 에  
   `PATH` = `<프로젝트>/android/tools:/usr/local/bin:/opt/homebrew/bin` 추가
8. 또는 Android Studio 완전 종료 후 `open -a "Android Studio"` 로 실행

프로젝트 루트에서 **`npm install`** 시 `patch-package`가 아래 패치를 적용합니다.

- `patches/expo-modules-autolinking+3.0.25.patch` — settings 플러그인 `node` → `local.properties`
- `patches/expo+54.0.34.patch` — `expo/scripts/autolinking.gradle` 동일
- `patches/expo-modules-core+3.0.30.patch` — stage/production flavor 시 `productionRelease` 컴포넌트

보조: `android/tools/node` 래퍼, `gradlew` PATH, `node-path.gradle`.

## Android Studio Image Asset (런처 아이콘)

`res` → Image Asset으로 `ic_launcher` 생성 후 **Finish** 하면 됩니다. 크기(Resize %)는 Studio에서 조정.

**빌드 오류** `ParseError ... [xX][mM][lL]` 또는 `XML 문서 구조` 가 나면 Image Asset **Finish** 후 아래를 확인합니다.

- 맨 위 **Apache 주석 블록 삭제** — **`<?xml` 이 파일 1행**이어야 함
- 선언이 `<xml ...>` 로 되어 있으면 **`<?xml ...?>`** 로 고침 (`?` 누락 시 파싱 실패)

- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`

위 두 파일에서 주석 블록을 지우고 1행을 `<?xml version="1.0" encoding="utf-8"?>` 로 맞춘 뒤 다시 `npx expo run:android`.

`npx expo prebuild -p android` 는 Image Asset으로 만든 `mipmap` 을 **Expo adaptiveIcon 기준으로 다시 생성**해 로고가 커질 수 있습니다. 아이콘은 **Studio Image Asset만** 쓸 때:

- 스플래시 크기만 바꿀 때: 프로젝트 루트에서 `npm run regenerate-android-splash` (또는 `app.config.ts`의 `imageWidth` 수정 후 동일 명령)
- **prebuild는** `google-services.json` 복사·Gradle 등이 필요할 때만 실행하고, 실행 후에는 Image Asset을 **다시 Finish** 하세요.

## Android flavor (stage / production)

- Gradle: `android/app/build.gradle` — `productFlavors` `production` / `stage`
- Android Studio Build Variant: `stageDebug`, `productionRelease` 등
- 로컬 스테이지 prebuild: `EAS_BUILD_PROFILE=stage npx expo prebuild -p android`
- EAS: `eas.json`의 `gradleCommand`가 프로필별 variant와 연결됨
- 로컬 `expo run:android` 스테이지: `--variant stageDebug`만으로는 부족함. Expo가 설치 확인에 쓰는 패키지는 `build.gradle`의 **첫 번째** `applicationId`(production)라서, stage APK 설치 후에도 `com.ssong.awallet`를 찾다 실패할 수 있음. → `npm run android:stage -- --device` (내부: `--app-id com.ssong.awallet.stage` + `EAS_BUILD_PROFILE=stage`)
