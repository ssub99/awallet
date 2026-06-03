package com.ssong.awallet.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.ssong.awallet.R

/** Android 홈 위젯: 서비스 로고, 이번달 소비, 금액(+ 텍스트 너비 마스크) */
object MonthlyExpenseWidgetRenderer {
  fun buildRemoteViews(context: Context, appWidgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.monthly_expense_widget)
    val isRevealed = WidgetDataStore.isRevealed(context)
    val amountText = WidgetDataStore.formatExpenseText(context)

    views.setTextViewText(R.id.widget_amount, amountText)
    WidgetAmountLayout.applyToRemoteViews(
      views,
      context,
      appWidgetId,
      amountText,
      isMasked = !isRevealed,
    )

    val clickIntent = Intent(context, MonthlyExpenseWidgetActionReceiver::class.java).apply {
      action = MonthlyExpenseWidgetActionReceiver.ACTION_WIDGET_TAP
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val pendingIntent = PendingIntent.getBroadcast(context, appWidgetId, clickIntent, flags)
    views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
    views.setOnClickPendingIntent(R.id.widget_title, pendingIntent)
    views.setOnClickPendingIntent(R.id.widget_amount, pendingIntent)

    return views
  }
}
