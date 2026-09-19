package com.ssong.awallet.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsInboxReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
      SmsInboxDebugLog.i("drop action=${intent.action}")
      return
    }

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isEmpty()) {
      SmsInboxDebugLog.i("drop reason=empty-pdus")
      return
    }

    val sender = messages.firstNotNullOfOrNull { it.originatingAddress }?.trim().orEmpty()
    val addresses = messages.mapNotNull { it.originatingAddress?.trim()?.takeIf(String::isNotEmpty) }
    SmsInboxDebugLog.i(
      "recv parts=${messages.size} senderRaw=${sender.ifEmpty { "<empty>" }} " +
        "addresses=$addresses norm=${SmsInboxNativeStore.normalizeSender(sender)}",
    )

    if (sender.isEmpty()) {
      SmsInboxDebugLog.i("drop reason=empty-sender")
      return
    }

    val senderGate = SmsInboxNativeStore.describeSenderGate(context, sender)
    SmsInboxDebugLog.i("gate.sender $senderGate")
    if (!senderGate.allowed) {
      SmsInboxDebugLog.i("drop reason=sender-not-allowed")
      return
    }

    val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }.trim()
    if (body.isEmpty()) {
      SmsInboxDebugLog.i("drop reason=empty-body")
      return
    }

    val hasKeyword = SmsInboxNativeStore.hasSupportedTransactionKeyword(body)
    SmsInboxDebugLog.i(
      "gate.keyword hasKeyword=$hasKeyword bodyPreview=${SmsInboxDebugLog.previewBody(body)}",
    )
    if (!hasKeyword) {
      SmsInboxDebugLog.i("drop reason=no-keyword need=[취소|입금|승인|출금]")
      return
    }

    val receivedAt = messages.minOfOrNull { it.timestampMillis } ?: System.currentTimeMillis()
    val enqueued = SmsInboxNativeStore.enqueue(context, sender, body, receivedAt)
    SmsInboxDebugLog.i(
      "enqueue ok=$enqueued receivedAt=$receivedAt sender=$sender " +
        "bodyPreview=${SmsInboxDebugLog.previewBody(body)}",
    )
    if (enqueued) {
      SmsInboxNativeEventEmitter.emitPendingEnqueued()
      SmsInboxDebugLog.i("emit PendingEnqueued")
    } else {
      SmsInboxDebugLog.i("drop reason=enqueue-duplicate-or-reject")
    }
  }
}
