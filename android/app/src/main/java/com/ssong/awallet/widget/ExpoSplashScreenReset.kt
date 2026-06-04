package com.ssong.awallet.widget

import expo.modules.splashscreen.SplashScreenManager

/**
 * expo SplashScreenManager.keepSplashScreenOnScreen 은 hide() 후 static 으로 false 유지됩니다.
 * cold start 시 keepSplashScreenOnScreen 이 false 로 남아 있을 수 있어 onCreate 전에 복구합니다.
 */
object ExpoSplashScreenReset {
  fun resetBeforeRegisterOnActivity() {
    try {
      val managerClass = SplashScreenManager::class.java
      val instance =
        managerClass.getDeclaredField("INSTANCE").apply { isAccessible = true }.get(null)

      fun setBooleanField(name: String, value: Boolean) {
        managerClass
          .getDeclaredField(name)
          .apply { isAccessible = true }
          .setBoolean(instance, value)
      }

      setBooleanField("keepSplashScreenOnScreen", true)
      setBooleanField("preventAutoHideCalled", true)

      WidgetDebugLog.d("스플래시 static 리셋: keepSplashScreenOnScreen=true, preventAutoHideCalled=true")
    } catch (e: Exception) {
      WidgetDebugLog.d("스플래시 static 리셋 실패: ${e.message}")
    }
  }
}
