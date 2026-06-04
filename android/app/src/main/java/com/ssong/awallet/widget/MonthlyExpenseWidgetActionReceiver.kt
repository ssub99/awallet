package com.ssong.awallet.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android 전용: 마스킹 시 탭 → 5초 공개, 공개 중 탭 → 앱 실행(런처와 동일 intent).
 */
class MonthlyExpenseWidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_WIDGET_TAP) {
      return
    }

    val appContext = context.applicationContext
    val isRevealed = WidgetDataStore.isRevealed(appContext)
    WidgetDebugLog.d("widgetTap isRevealed=$isRevealed")
    if (isRevealed) {
      WidgetDebugLog.d("widgetTap → 앱 실행 (공개 상태)")
      WidgetAppLaunch.startAppFromWidget(appContext)
      return
    }

    WidgetDebugLog.d("widgetTap → 5초 공개만 (앱 미실행)")
    WidgetDataStore.setRevealed(appContext, true)
    WidgetRevealScheduler.scheduleRemask(appContext)
    MonthlyExpenseWidgetUpdater.updateAll(appContext)
  }

  companion object {
    const val ACTION_WIDGET_TAP = "com.ssong.awallet.widget.ACTION_WIDGET_TAP"
  }
}
