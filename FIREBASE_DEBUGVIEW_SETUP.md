# Firebase Analytics DebugView 설정 가이드

## 문제 해결 완료 사항

1. ✅ `GoogleService-Info.plist`에서 `IS_ANALYTICS_ENABLED`를 `true`로 변경
2. ✅ Analytics 초기화 로직 개선 및 로깅 추가

## iOS DebugView 활성화 방법

Firebase Analytics DebugView를 사용하려면 Xcode Scheme에 런타임 인자를 추가해야 합니다.

### 1. Xcode에서 Scheme 편집

1. Xcode에서 프로젝트 열기
2. 상단 메뉴에서 **Product > Scheme > Edit Scheme...** 선택
3. 왼쪽 사이드바에서 **Run** 선택
4. 상단 탭에서 **Arguments** 선택
5. **Arguments Passed On Launch** 섹션에서 `+` 버튼 클릭
6. 다음 인자 추가:
   ```
   -FIRAnalyticsDebugEnabled
   ```
7. **Close** 클릭

### 2. 앱 재빌드 및 실행

1. Xcode에서 앱을 완전히 종료 (Cmd+Q)
2. Clean Build Folder (Cmd+Shift+K)
3. 앱 다시 빌드 및 실행 (Cmd+R)

### 3. Firebase Console에서 확인

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택: **awallet-29d33**
3. 왼쪽 메뉴에서 **Analytics > DebugView** 선택
4. 앱에서 이벤트를 발생시키면 실시간으로 표시됩니다

## 테스트 이벤트

앱 시작 시 다음 이벤트들이 자동으로 전송됩니다:

- `app_started` - 앱 시작 이벤트
- `debug_view_test` - DebugView 테스트 이벤트 (개발 모드만)
- `analytics_initialized` - Analytics 초기화 이벤트 (개발 모드만)

## 확인 사항

### 콘솔 로그 확인

앱 실행 시 다음 로그들이 표시되어야 합니다:

```
📊 [Analytics] Firebase Analytics 초기화 시작...
📊 [Analytics] Analytics 수집 활성화 완료
📊 [Analytics] 개발 모드: DebugView 활성화 시도...
📊 [Analytics] Firebase Analytics 인스턴스: ✅ 초기화됨
📊 [Analytics] Event logged: debug_view_test
📊 [Analytics] Event logged: analytics_initialized
📊 [Analytics] Event logged: app_started
✅ Firebase Analytics 초기화 완료
```

### DebugView에서 확인

- Firebase Console > Analytics > DebugView에서 실시간 이벤트 확인
- 이벤트가 보이지 않으면:
  1. Xcode Scheme에 `-FIRAnalyticsDebugEnabled` 인자가 추가되었는지 확인
  2. 앱을 완전히 재시작했는지 확인
  3. 네트워크 연결 상태 확인
  4. Firebase Console에서 프로젝트가 올바른지 확인

## 추가 이벤트 테스트

앱 내에서 추가 이벤트를 테스트하려면:

```typescript
import { logEvent } from '@/utils/analytics';

// 예시: 버튼 클릭 이벤트
await logEvent('button_clicked', {
  button_name: 'test_button',
  screen: 'home',
});
```

## 문제 해결

### DebugView에 이벤트가 보이지 않는 경우

1. **Xcode Scheme 확인**
   - `-FIRAnalyticsDebugEnabled` 인자가 추가되었는지 확인
   - Debug 구성에서만 작동합니다 (Release에서는 작동하지 않음)

2. **앱 재시작**
   - Xcode에서 앱을 완전히 종료하고 다시 실행

3. **Firebase Console 확인**
   - 올바른 프로젝트를 선택했는지 확인
   - DebugView 페이지가 열려있는지 확인

4. **네트워크 확인**
   - 인터넷 연결 상태 확인
   - 방화벽이나 VPN이 Firebase 서버를 차단하지 않는지 확인

5. **로그 확인**
   - Xcode 콘솔에서 Analytics 관련 로그 확인
   - 에러 메시지가 있는지 확인

