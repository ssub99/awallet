package com.ssong.awallet.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock

object WidgetRevealScheduler {
  private const val REQUEST_CODE_REMASK = 40_001

  fun scheduleRemask(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val remaskIntent = Intent(context, RemaskMonthlyExpenseReceiver::class.java).apply {
      action = RemaskMonthlyExpenseReceiver.ACTION_REMASK
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      REQUEST_CODE_REMASK,
      remaskIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    alarmManager.cancel(pendingIntent)
    val triggerAt = SystemClock.elapsedRealtime() + WidgetDataStore.REVEAL_DURATION_MS
    alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
  }

  fun cancelRemask(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val remaskIntent = Intent(context, RemaskMonthlyExpenseReceiver::class.java).apply {
      action = RemaskMonthlyExpenseReceiver.ACTION_REMASK
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      REQUEST_CODE_REMASK,
      remaskIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    alarmManager.cancel(pendingIntent)
  }
}
