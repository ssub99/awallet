package com.ssong.awallet.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

/**
 * 홈 화면 2×1 "이번달 소비" 위젯 (iOS MonthlyExpenseWidget 사각형 레이아웃과 동일 UX).
 */
class MonthlyExpenseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (appWidgetId in appWidgetIds) {
      val views = MonthlyExpenseWidgetRenderer.buildRemoteViews(context, appWidgetId)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  override fun onEnabled(context: Context) {
    MonthlyExpenseWidgetUpdater.updateAll(context)
  }
}
