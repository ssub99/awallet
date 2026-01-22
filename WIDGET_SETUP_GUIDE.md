# iOS 위젯 개발 환경 설정 가이드

## 📋 개요

이번달 소비금액을 표시하는 iOS 위젯을 개발하기 위한 환경 설정 가이드입니다.

## ✅ 완료된 작업

1. ✅ 위젯 Extension 디렉토리 구조 생성 (`ios/awalletWidget/`)
2. ✅ 위젯 Extension entitlements 파일 생성 (App Group 설정)
3. ✅ 위젯 Extension 기본 Swift 파일 생성 (WidgetKit)
4. ✅ React Native에서 App Group UserDefaults에 데이터 저장하는 유틸리티 생성
5. ✅ 이번달 소비금액 계산 및 저장 로직 구현

## 🔧 Xcode에서 위젯 Extension 타겟 추가하기

### 1. Xcode 프로젝트 열기

```bash
cd ios
open awallet.xcodeproj
```

### 2. 위젯 Extension 타겟 추가

1. Xcode에서 프로젝트 네비게이터에서 프로젝트 이름(`awallet`) 클릭
2. 하단의 `+` 버튼 클릭 (Targets 섹션 아래)
3. **iOS** → **Widget Extension** 선택
4. **Next** 클릭
5. 설정 입력:
   - **Product Name**: `awalletWidget`
   - **Organization Identifier**: `com.ssong` (기존과 동일)
   - **Bundle Identifier**: `com.ssong.awallet.awalletWidget` (자동 생성됨)
   - **Language**: Swift
   - **Include Configuration Intent**: ❌ 체크 해제
6. **Finish** 클릭

### 3. 기존 위젯 파일로 교체

Xcode가 자동으로 생성한 위젯 파일들을 삭제하고, 우리가 만든 파일들을 사용합니다:

1. Xcode에서 생성된 `awalletWidget.swift` 파일 삭제
2. 프로젝트 네비게이터에서 `awalletWidget` 폴더를 우클릭 → **Add Files to "awalletWidget"...**
3. 다음 파일들 선택:
   - `ios/awalletWidget/awalletWidget.swift`
   - `ios/awalletWidget/awalletWidget.entitlements`
   - `ios/awalletWidget/Info.plist`

### 4. 위젯 Extension 타겟 설정

1. 프로젝트 네비게이터에서 `awalletWidget` 타겟 선택
2. **General** 탭:
   - **Deployment Target**: iOS 16.0 이상 (WidgetKit 요구사항)
3. **Signing & Capabilities** 탭:
   - **Team**: 기존 앱과 동일한 팀 선택
   - **App Group**: `group.com.ssong.awallet` 추가 (이미 entitlements에 설정됨)
4. **Build Settings** 탭:
   - **Swift Language Version**: Swift 5
   - **iOS Deployment Target**: 16.0

### 5. WidgetDataSync 모듈 등록

1. `ios/awallet/WidgetDataSync.swift` 파일이 메인 앱 타겟에 포함되어 있는지 확인
2. **Build Phases** → **Compile Sources**에 `WidgetDataSync.swift`가 있는지 확인
3. 없으면 추가:
   - **Build Phases** 탭 → **Compile Sources** 섹션
   - `+` 버튼 클릭 → `WidgetDataSync.swift` 선택

### 6. Bridging Header 확인

`ios/awallet/awallet-Bridging-Header.h` 파일에 다음이 포함되어 있는지 확인:

```objc
#import <React/RCTBridgeModule.h>
#import <WidgetKit/WidgetKit.h>
```

## 📱 테스트 방법

### 1. 빌드 및 실행

```bash
# iOS 시뮬레이터에서 실행
npm run ios

# 또는 Xcode에서 직접 빌드
# Product → Run (⌘R)
```

### 2. 위젯 추가하기

1. 시뮬레이터/실기기에서 홈 화면으로 이동
2. 빈 공간을 길게 눌러 편집 모드 진입
3. 좌측 상단의 `+` 버튼 클릭
4. **에이월렛** 검색
5. **이번달 소비** 위젯 선택
6. 크기 선택 (Small, Medium, Rectangular, Inline)
7. **위젯 추가** 클릭

### 3. 데이터 확인

1. 앱을 실행하여 홈 화면에서 이번달 소비금액 확인
2. 위젯이 자동으로 업데이트되는지 확인
3. 위젯을 길게 눌러 **위젯 새로고침** 선택하여 수동 업데이트 테스트

## 🔍 문제 해결

### 위젯이 데이터를 표시하지 않는 경우

1. **App Group 확인**:
   - 메인 앱과 위젯 Extension 모두 `group.com.ssong.awallet` App Group이 설정되어 있는지 확인
   - Xcode → Signing & Capabilities → App Groups

2. **데이터 저장 확인**:
   - React Native 콘솔에서 `[WidgetDataSync]` 로그 확인
   - 에러가 있다면 네이티브 모듈 등록 확인

3. **위젯 새로고침**:
   - 위젯을 길게 눌러 **위젯 새로고침** 선택
   - 또는 앱을 완전히 종료 후 재실행

### 빌드 에러가 발생하는 경우

1. **Clean Build Folder**:
   - Xcode → Product → Clean Build Folder (⇧⌘K)

2. **Pod 재설치**:
   ```bash
   cd ios
   pod deintegrate
   pod install
   ```

3. **Derived Data 삭제**:
   - Xcode → Preferences → Locations → Derived Data 경로 확인
   - Finder에서 해당 폴더 삭제

## 📝 다음 단계

위젯이 정상적으로 작동하면:

1. 위젯 UI 디자인 개선
2. 잠금화면 위젯 최적화
3. 챌린지 프로그레스 바 추가 (향후 작업)

## 📚 참고 자료

- [Apple WidgetKit Documentation](https://developer.apple.com/documentation/widgetkit)
- [App Groups Documentation](https://developer.apple.com/documentation/xcode/configuring-app-groups)
