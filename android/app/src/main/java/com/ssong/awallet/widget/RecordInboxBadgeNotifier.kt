package com.ssong.awallet.widget

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.ssong.awallet.MainActivity
import com.ssong.awallet.R

/**
 * 기록 수신함 OS 아이콘 뱃지용 조용한 로컬 알림.
 * - 서버 푸시 아님 · 소리/진동/헤드업 없음
 * - 고정 ID 1개만 upsert (건수 갱신)
 * - 저녁/챌린지 등 다른 채널과 분리 (이 채널만 showBadge)
 */
object RecordInboxBadgeNotifier {
  const val CHANNEL_ID = "record_inbox_icon_badge"
  private const val NOTIFICATION_ID = 71001

  fun refreshFromStore(context: Context) {
    update(context, RecordInboxNativeStore.iconBadgeCount(context))
  }

  fun update(context: Context, count: Int) {
    val appContext = context.applicationContext
    if (count <= 0) {
      cancel(appContext)
      return
    }
    ensureChannel(appContext)
    val pendingIntent = PendingIntent.getActivity(
      appContext,
      NOTIFICATION_ID,
      Intent(appContext, MainActivity::class.java).apply {
        action = Intent.ACTION_MAIN
        addCategory(Intent.CATEGORY_LAUNCHER)
        putExtra(RecordInboxLaunchExtras.EXTRA_OPEN_RECORD_INBOX, true)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle("기록 수신함")
      .setContentText("기록 수신함에 확인할 기록이 ${count}건 있어요")
      .setNumber(count)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .setOngoing(false)
      .build()

    try {
      NotificationManagerCompat.from(appContext).notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS 거부 시 뱃지 불가 — 무시
    }
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context.applicationContext).cancel(NOTIFICATION_ID)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    // DEFAULT + 무음: 일부 삼성 런처가 LOW에서 뱃지를 생략하는 경우 대비
    val channel = NotificationChannel(
      CHANNEL_ID,
      "기록 수신함",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "기록 수신함 미확인 건수"
      setShowBadge(true)
      setSound(null, null)
      enableVibration(false)
      enableLights(false)
      lockscreenVisibility = Notification.VISIBILITY_SECRET
    }
    manager.createNotificationChannel(channel)
  }
}
