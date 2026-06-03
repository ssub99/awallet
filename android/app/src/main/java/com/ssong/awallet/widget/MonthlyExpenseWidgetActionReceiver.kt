package com.ssong.awallet.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android 전용: 마스킹 시 탭 → 5초 공개, 공개 중 탭 → 앱 실행(스플래시 포함 cold start).
 */
class MonthlyExpenseWidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_WIDGET_TAP) {
      return
    }

    val appContext = context.applicationContext
    if (WidgetDataStore.isRevealed(appContext)) {
      appContext.startActivity(WidgetAppLaunch.buildLaunchIntent(appContext))
      return
    }

    WidgetDataStore.setRevealed(appContext, true)
    WidgetRevealScheduler.scheduleRemask(appContext)
    MonthlyExpenseWidgetUpdater.updateAll(appContext)
  }

  companion object {
    const val ACTION_WIDGET_TAP = "com.ssong.awallet.widget.ACTION_WIDGET_TAP"
  }
}
