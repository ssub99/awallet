package com.ssong.awallet.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

object SmsInboxNativeStore {
  private const val PREFS_NAME = "awallet_sms_inbox_native"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_NUMBERS = "numbers"
  private const val KEY_PENDING = "pending"
  private const val KEY_FINGERPRINTS = "fingerprints"
  private const val MAX_PENDING_COUNT = 200
  private const val MAX_FINGERPRINT_COUNT = 400
  private const val FINGERPRINT_TTL_MS = 7L * 24L * 60L * 60L * 1000L

  data class PendingItem(
    val id: String,
    val sender: String,
    val body: String,
    val enqueuedAt: String,
  )

  @Synchronized
  fun syncSettings(context: Context, enabled: Boolean, numbers: List<String>) {
    val normalized = numbers
      .map(::normalizeSender)
      .filter(String::isNotEmpty)
      .distinct()
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
      .putString(KEY_NUMBERS, JSONArray(normalized).toString())
      .apply()
  }

  fun isSenderAllowed(context: Context, sender: String): Boolean {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(KEY_ENABLED, false)) return false
    val normalizedSender = normalizeSender(sender)
    if (normalizedSender.isEmpty()) return false
    val numbers = parseStringArray(prefs.getString(KEY_NUMBERS, null))
    return numbers.any { allowed ->
      normalizedSender == allowed ||
        normalizedSender.endsWith(allowed) ||
        allowed.endsWith(normalizedSender)
    }
  }

  fun hasSupportedTransactionKeyword(body: String): Boolean {
    return SUPPORTED_TRANSACTION_KEYWORDS.any(body::contains)
  }

  @Synchronized
  fun enqueue(context: Context, sender: String, body: String, receivedAt: Long): Boolean {
    val trimmedBody = body.trim()
    val trimmedSender = sender.trim()
    if (trimmedBody.isEmpty() || trimmedSender.isEmpty()) return false

    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val fingerprint = fingerprint(trimmedSender, trimmedBody, receivedAt)
    val fingerprints = loadFingerprints(prefs.getString(KEY_FINGERPRINTS, null), now)
    if (fingerprints.any { it.first == fingerprint }) return false

    val pending = loadPending(prefs.getString(KEY_PENDING, null)).toMutableList()
    pending.add(
      PendingItem(
        id = UUID.randomUUID().toString(),
        sender = trimmedSender,
        body = trimmedBody,
        enqueuedAt = iso8601(receivedAt),
      ),
    )

    // ponytail: 대기 큐는 200건으로 제한한다. 실제 적체가 확인되면 파일 기반 큐로 확장한다.
    val boundedPending = pending.takeLast(MAX_PENDING_COUNT)
    val boundedFingerprints = (fingerprints + (fingerprint to now)).takeLast(MAX_FINGERPRINT_COUNT)
    prefs.edit()
      .putString(KEY_PENDING, pendingToJson(boundedPending).toString())
      .putString(KEY_FINGERPRINTS, fingerprintsToJson(boundedFingerprints).toString())
      .apply()
    return true
  }

  @Synchronized
  fun peek(context: Context): List<PendingItem> {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    return loadPending(prefs.getString(KEY_PENDING, null))
  }

  @Synchronized
  fun acknowledge(context: Context, ids: Set<String>) {
    if (ids.isEmpty()) return
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val remaining = loadPending(prefs.getString(KEY_PENDING, null))
      .filterNot { ids.contains(it.id) }
    prefs.edit().putString(KEY_PENDING, pendingToJson(remaining).toString()).apply()
  }

  @Synchronized
  fun clear(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .clear()
      .apply()
  }

  internal fun normalizeSender(raw: String): String {
    var digits = raw.filter(Char::isDigit)
    if (digits.startsWith("82") && digits.length >= 10) {
      digits = digits.drop(2)
    }
    if (digits.startsWith("0")) {
      digits = digits.drop(1)
    }
    return digits
  }

  private fun loadPending(raw: String?): List<PendingItem> {
    if (raw.isNullOrBlank()) return emptyList()
    return try {
      val array = JSONArray(raw)
      buildList {
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          val id = item.optString("id")
          val body = item.optString("body")
          val sender = item.optString("sender")
          if (id.isBlank() || body.isBlank() || sender.isBlank()) continue
          add(
            PendingItem(
              id = id,
              sender = sender,
              body = body,
              enqueuedAt = item.optString("enqueuedAt"),
            ),
          )
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun pendingToJson(items: List<PendingItem>): JSONArray {
    return JSONArray().apply {
      items.forEach { item ->
        put(
          JSONObject()
            .put("id", item.id)
            .put("sender", item.sender)
            .put("body", item.body)
            .put("enqueuedAt", item.enqueuedAt),
        )
      }
    }
  }

  private fun loadFingerprints(raw: String?, now: Long): List<Pair<String, Long>> {
    if (raw.isNullOrBlank()) return emptyList()
    return try {
      val array = JSONArray(raw)
      buildList {
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          val hash = item.optString("hash")
          val createdAt = item.optLong("createdAt")
          if (hash.isNotBlank() && now - createdAt <= FINGERPRINT_TTL_MS) {
            add(hash to createdAt)
          }
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun fingerprintsToJson(items: List<Pair<String, Long>>): JSONArray {
    return JSONArray().apply {
      items.forEach { (hash, createdAt) ->
        put(JSONObject().put("hash", hash).put("createdAt", createdAt))
      }
    }
  }

  private fun parseStringArray(raw: String?): List<String> {
    if (raw.isNullOrBlank()) return emptyList()
    return try {
      val array = JSONArray(raw)
      buildList {
        for (index in 0 until array.length()) {
          val value = array.optString(index)
          if (value.isNotBlank()) add(value)
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun fingerprint(sender: String, body: String, receivedAt: Long): String {
    val source = "${normalizeSender(sender)}\u0000$body\u0000$receivedAt"
    return MessageDigest.getInstance("SHA-256")
      .digest(source.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
  }

  private fun iso8601(timestamp: Long): String {
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(timestamp))
  }

  private val SUPPORTED_TRANSACTION_KEYWORDS = listOf("취소", "입금", "승인", "출금")
}
