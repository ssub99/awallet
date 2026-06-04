package com.ssong.awallet.widget

import android.content.Context

/**
 * 위젯에서 앱 실행.
 * - 앱 살아 있음: REORDER_TO_FRONT, 스플래시 없음
 * - 앱 완전 종료: Main 직행 + [WidgetMainSplashOverlay] (WindowManager)
 */
object WidgetAppLaunch {
  fun startAppFromWidget(context: Context) {
    WidgetDebugLog.environment(context.packageName)
    val mainAlive = MainActivityHolder.current != null
    WidgetDebugLog.d(
      "startAppFromWidget mainIsStarted=${MainActivityLifecycle.isStarted} " +
        "mainInstance=$mainAlive context=${context.javaClass.simpleName}",
    )

    // 백그라운드/종료 후에도 mainInstance 가 남을 수 있음 → isStarted 만 warm 판별
    if (MainActivityLifecycle.isStarted) {
      WidgetDebugLog.d("경로=BRING_FORWARD (포그라운드, 스플래시 없음)")
      val intent = WidgetLauncherIntents.createBringForwardIntent(context)
      WidgetDebugLog.intentFlags("bringForward", intent.flags)
      context.startActivity(intent)
      return
    }

    WidgetDebugLog.d("경로=COLD_MAIN (Main 직행 + WindowManager 스플래시, trampoline 없음)")
    WidgetLaunchPrefs.markTrampolineSplashPending(context.applicationContext)
    val intent = WidgetLauncherIntents.createColdStartIntentFromTrampoline(context)
    WidgetDebugLog.intentFlags("coldMain", intent.flags)
    context.startActivity(intent)
  }
}
