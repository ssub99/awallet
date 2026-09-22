package com.ssong.awallet.widget

import android.app.Notification
import android.app.Person
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.provider.Settings
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * RCS「대화」등 SMS_RECEIVED로 오지 않는 거래 알림을
 * 기본 메시지 앱 알림에서 읽어 동일 native queue로 enqueue한다.
 */
class SmsInboxNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    if (!MESSAGE_PACKAGES.contains(sbn.packageName)) return

    val context = applicationContext
    if (!SmsInboxNativeStore.isReceiveEnabled(context)) return

    val notification = sbn.notification ?: return
    val extras = notification.extras ?: Bundle()
    val body = extractBody(extras).trim()
    if (body.isEmpty()) {
      return
    }
    if (!SmsInboxNativeStore.hasSupportedTransactionKeyword(body)) {
      return
    }

    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty()
    val infoText = extras.getCharSequence(Notification.EXTRA_INFO_TEXT)?.toString().orEmpty()
    val conversationTitle =
      extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString().orEmpty()
    val sender = resolveSender(
      context = context,
      title = title,
      subText = subText,
      infoText = infoText,
      conversationTitle = conversationTitle,
      body = body,
      extras = extras,
    )
    if (sender.isEmpty()) {
      return
    }

    if (!SmsInboxNativeStore.isSenderAllowed(context, sender)) {
      return
    }

    val receivedAt = sbn.postTime.takeIf { it > 0L } ?: System.currentTimeMillis()
    if (SmsInboxNativeStore.enqueue(context, sender, body, receivedAt)) {
      SmsInboxNativeEventEmitter.emitPendingEnqueued()
    }
  }

  companion object {
    private val MESSAGE_PACKAGES = setOf(
      "com.samsung.android.messaging",
      "com.google.android.apps.messaging",
      "com.android.mms",
      "com.android.messaging",
    )

    fun isNotificationAccessEnabled(context: Context): Boolean {
      val component = ComponentName(context, SmsInboxNotificationListener::class.java)
      val flat = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners",
      ).orEmpty()
      if (flat.isEmpty()) return false
      for (entry in flat.split(':')) {
        val enabled = ComponentName.unflattenFromString(entry) ?: continue
        if (enabled == component) return true
      }
      return flat.contains(component.flattenToString()) ||
        flat.contains(context.packageName + "/" + SmsInboxNotificationListener::class.java.name)
    }

    fun openNotificationAccessSettings(context: Context) {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    fun defaultSmsPackage(context: Context): String? {
      return Telephony.Sms.getDefaultSmsPackage(context)
        ?: MESSAGE_PACKAGES.firstOrNull { pkg ->
          try {
            context.packageManager.getPackageInfo(pkg, 0)
            true
          } catch (_: Exception) {
            false
          }
        }
    }

    fun openDefaultSmsNotificationSettings(context: Context) {
      val pkg = defaultSmsPackage(context) ?: return
      val intent = Intent().apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
          putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
        } else {
          action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
          data = android.net.Uri.fromParts("package", pkg, null)
        }
      }
      context.startActivity(intent)
    }

    /** best-effort: 확인 불가면 true(게이트 막지 않음) */
    fun areDefaultSmsNotificationsEnabled(context: Context): Boolean {
      val pkg = defaultSmsPackage(context) ?: return true
      return try {
        val appOpsClass = Class.forName("android.app.AppOpsManager")
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) ?: return true
        val appInfo = context.packageManager.getApplicationInfo(pkg, 0)
        val checkOp = appOpsClass.getMethod(
          "checkOpNoThrow",
          String::class.java,
          Int::class.javaPrimitiveType,
          String::class.java,
        )
        val mode = checkOp.invoke(appOps, "android:post_notification", appInfo.uid, pkg) as Int
        mode == 0 || mode == 3
      } catch (_: Exception) {
        true
      }
    }

    private fun extractBody(extras: Bundle): String {
      @Suppress("DEPRECATION")
      val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
      if (messages != null && messages.isNotEmpty()) {
        val lines = messages.mapNotNull { item ->
          messageText(item)?.takeIf { it.isNotEmpty() }
        }
        if (lines.isNotEmpty()) return lines.joinToString("\n")
      }

      val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()
      if (bigText.isNotEmpty()) return bigText

      val textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
      if (textLines != null && textLines.isNotEmpty()) {
        val joined = textLines.mapNotNull { it?.toString()?.trim()?.takeIf(String::isNotEmpty) }
        if (joined.isNotEmpty()) return joined.joinToString("\n")
      }

      return extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    }

    private fun messageText(item: Parcelable?): String? {
      val bundle = item as? Bundle ?: return null
      return bundle.getCharSequence("text")?.toString()?.trim()
    }

    private fun resolveSender(
      context: Context,
      title: String,
      subText: String,
      infoText: String,
      conversationTitle: String,
      body: String,
      extras: Bundle,
    ): String {
      val candidates = linkedSetOf<String>()
      listOf(title, subText, infoText, conversationTitle, body).forEach { raw ->
        extractPhoneCandidates(raw).forEach(candidates::add)
      }
      extractSenderCandidatesFromMessages(extras).forEach(candidates::add)
      extractSenderCandidatesFromPeople(extras).forEach(candidates::add)

      for (candidate in candidates) {
        if (SmsInboxNativeStore.isSenderAllowed(context, candidate)) {
          return candidate
        }
      }

      val haystack = SmsInboxNativeStore.normalizeSender(
        "$title $subText $infoText $conversationTitle $body",
      )
      for (allowed in SmsInboxNativeStore.allowedNumbers(context)) {
        if (allowed.isEmpty()) continue
        if (haystack.contains(allowed)) {
          return allowed
        }
      }

      // 삼성 메시지 RCS: 제목이 연락처명이고 본문만 카드 문자인 경우가 많다.
      // 대표번호(4~8자리) allowlist가 하나면 카드성 본문에 한해 매칭한다.
      if (looksLikeCardOrBankSms(body)) {
        val shortCodes = SmsInboxNativeStore.allowedNumbers(context)
          .filter { it.length in 4..8 }
          .distinct()
        if (shortCodes.size == 1) {
          return shortCodes.first()
        }
        shortCodes.firstOrNull { haystack.contains(it) }?.let { return it }
      }
      return ""
    }

    private fun looksLikeCardOrBankSms(body: String): Boolean {
      if (!SmsInboxNativeStore.hasSupportedTransactionKeyword(body)) return false
      return body.contains("카드") ||
        body.contains("은행") ||
        body.contains("Web발신") ||
        body.contains("웹발신") ||
        Regex("""\d{1,3}(?:,\d{3})+원|\d+원""").containsMatchIn(body)
    }

    private fun extractSenderCandidatesFromMessages(extras: Bundle): List<String> {
      @Suppress("DEPRECATION")
      val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return emptyList()
      val out = mutableListOf<String>()
      for (item in messages) {
        val bundle = item as? Bundle ?: continue
        bundle.getCharSequence("sender")?.toString()?.let { raw ->
          extractPhoneCandidates(raw).forEach(out::add)
          out.add(raw)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          @Suppress("DEPRECATION")
          val person = bundle.getParcelable<Person>("sender_person")
          person?.uri?.let { uri ->
            extractPhoneCandidates(uri).forEach(out::add)
          }
          person?.name?.toString()?.let { name ->
            extractPhoneCandidates(name).forEach(out::add)
          }
        }
      }
      return out
    }

    private fun extractSenderCandidatesFromPeople(extras: Bundle): List<String> {
      val out = mutableListOf<String>()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        @Suppress("DEPRECATION")
        val people =
          extras.getParcelableArrayList<Person>("android.people.list")
            ?: extras.getParcelableArrayList<Person>(Notification.EXTRA_PEOPLE_LIST)
        people?.forEach { person ->
          person.uri?.let { extractPhoneCandidates(it).forEach(out::add) }
          person.name?.toString()?.let { extractPhoneCandidates(it).forEach(out::add) }
        }
      }
      @Suppress("DEPRECATION")
      val legacy = extras.getStringArray(Notification.EXTRA_PEOPLE)
      legacy?.forEach { extractPhoneCandidates(it).forEach(out::add) }
      return out
    }

    private fun extractPhoneCandidates(raw: String): List<String> {
      if (raw.isBlank()) return emptyList()
      val cleaned = raw.replace('\u2068', ' ').replace('\u2069', ' ')
      if (cleaned.startsWith("tel:", ignoreCase = true)) {
        return listOf(cleaned.substringAfter(':'))
      }
      val matches = Regex("""(?:\+?\d[\d\-\s()]{3,}\d)""").findAll(cleaned)
      return matches.map { it.value }.toList()
    }
  }
}
