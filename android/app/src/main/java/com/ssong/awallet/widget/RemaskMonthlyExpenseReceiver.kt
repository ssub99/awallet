package com.ssong.awallet.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 공개 5초 후 자동 재마스킹 (iOS 타임라인 두 번째 엔트리와 동일). */
class RemaskMonthlyExpenseReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_REMASK) {
      return
    }
    val appContext = context.applicationContext
    WidgetDataStore.clearRevealState(appContext)
    MonthlyExpenseWidgetUpdater.updateAll(appContext)
  }

  companion object {
    const val ACTION_REMASK = "com.ssong.awallet.widget.ACTION_REMASK"
  }
}
