package com.ssong.awallet.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsInboxReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
      return
    }

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isEmpty()) {
      return
    }

    val sender = messages.firstNotNullOfOrNull { it.originatingAddress }?.trim().orEmpty()
    if (sender.isEmpty()) {
      return
    }

    if (!SmsInboxNativeStore.isSenderAllowed(context, sender)) {
      return
    }

    val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }.trim()
    if (body.isEmpty()) {
      return
    }

    if (!SmsInboxNativeStore.hasSupportedTransactionKeyword(body)) {
      return
    }

    val receivedAt = messages.minOfOrNull { it.timestampMillis } ?: System.currentTimeMillis()
    if (SmsInboxNativeStore.enqueue(context, sender, body, receivedAt)) {
      SmsInboxNativeEventEmitter.emitPendingEnqueued()
    }
  }
}
