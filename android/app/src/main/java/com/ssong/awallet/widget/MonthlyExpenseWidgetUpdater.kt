package com.ssong.awallet.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

object MonthlyExpenseWidgetUpdater {
  fun updateAll(context: Context) {
    val appWidgetManager = AppWidgetManager.getInstance(context)
    val componentName = ComponentName(context, MonthlyExpenseWidgetProvider::class.java)
    val widgetIds = appWidgetManager.getAppWidgetIds(componentName)
    if (widgetIds.isEmpty()) {
      return
    }

    for (widgetId in widgetIds) {
      val views = MonthlyExpenseWidgetRenderer.buildRemoteViews(context, widgetId)
      appWidgetManager.updateAppWidget(widgetId, views)
    }
  }
}
