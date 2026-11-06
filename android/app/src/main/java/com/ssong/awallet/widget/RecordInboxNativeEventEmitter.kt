package com.ssong.awallet.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

object RecordInboxNativeEventEmitter {
  const val EVENT_PENDING_ENQUEUED = "RecordInboxPendingEnqueued"
  const val LEGACY_EVENT_PENDING_ENQUEUED = "SmsInboxPendingEnqueued"
  const val EVENT_OPEN_RECORD_INBOX = "RecordInboxOpenPending"
  private const val ACTION_PENDING_ENQUEUED = "com.ssong.awallet.action.RECORD_INBOX_PENDING_ENQUEUED"
  private const val LEGACY_ACTION_PENDING_ENQUEUED =
    "com.ssong.awallet.action.SMS_INBOX_PENDING_ENQUEUED"

  private var reactContextRef: WeakReference<ReactApplicationContext>? = null
  private var crossProcessReceiver: BroadcastReceiver? = null

  fun attach(reactContext: ReactApplicationContext) {
    reactContextRef = WeakReference(reactContext)
    if (crossProcessReceiver == null) {
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          emitPendingEnqueued()
        }
      }
      ContextCompat.registerReceiver(
        reactContext.applicationContext,
        receiver,
        IntentFilter(ACTION_PENDING_ENQUEUED).apply {
          addAction(LEGACY_ACTION_PENDING_ENQUEUED)
        },
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
      crossProcessReceiver = receiver
    }
  }

  fun detach(reactContext: ReactApplicationContext) {
    if (reactContextRef?.get() === reactContext) {
      reactContextRef = null
      crossProcessReceiver?.let {
        try {
          reactContext.applicationContext.unregisterReceiver(it)
        } catch (_: IllegalArgumentException) {
          // already unregistered
        }
      }
      crossProcessReceiver = null
    }
  }

  fun emitPendingEnqueued() {
    emit(EVENT_PENDING_ENQUEUED)
    emit(LEGACY_EVENT_PENDING_ENQUEUED)
  }

  /** 뱃지 알림 탭 (앱 이미 떠 있을 때) → JS flush 후 수신함 오픈 */
  fun emitOpenRecordInboxPending() {
    emit(EVENT_OPEN_RECORD_INBOX)
  }

  private fun emit(eventName: String) {
    val reactContext = reactContextRef?.get() ?: return
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, null)
  }

  /** :sms_listener 프로세스에서 호출 — 앱 프로세스의 [attach] 리시버로 전달한다. */
  fun notifyFromOtherProcess(context: Context) {
    context.sendBroadcast(Intent(ACTION_PENDING_ENQUEUED).setPackage(context.packageName))
    context.sendBroadcast(Intent(LEGACY_ACTION_PENDING_ENQUEUED).setPackage(context.packageName))
  }
}
