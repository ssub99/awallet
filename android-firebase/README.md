# Android Firebase 설정 (소스)

iOS `ios/awallet/GoogleService-Info.plist`와 같은 **원본** 위치입니다.

- **파일:** `google-services.json` (Firebase Console → Android 앱 `com.ssong.awallet`)
- **연결:** `app.json` → `expo.android.googleServicesFile`
- **Stage:** iOS와 같이 Firebase 설정 파일은 분리하지 않음 (Production 1개)

`npx expo prebuild -p android` 실행 시 `android/app/google-services.json`으로 복사됩니다.  
`android/app/` 안의 json은 **직접 수정하지 마세요** (prebuild가 덮어씀).

`prebuild --clean`은 `android/` 폴더를 지우므로, 원본은 반드시 이 디렉터리에 유지합니다.
