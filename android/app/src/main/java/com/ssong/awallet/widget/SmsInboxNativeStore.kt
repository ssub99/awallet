package com.ssong.awallet.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * 알림 리스너(:sms_listener 프로세스)와 앱 프로세스가 함께 쓰므로
 * SharedPreferences(프로세스별 캐시) 대신 파일 + FileLock으로 매 호출 디스크에서 읽고 쓴다.
 */
object SmsInboxNativeStore {
  /** 이전 버전 저장소. 최초 1회 파일로 이전 후 비운다. */
  private const val PREFS_NAME = "awallet_sms_inbox_native"
  private const val STORE_FILE = "awallet_sms_inbox_native.json"
  private const val LOCK_FILE = "awallet_sms_inbox_native.lock"
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

  data class SenderGateResult(
    val allowed: Boolean,
    val enabled: Boolean,
    val senderRaw: String,
    val senderNorm: String,
    val allowlist: List<String>,
    val matchMode: String,
  ) {
    override fun toString(): String {
      return "allowed=$allowed enabled=$enabled senderRaw=$senderRaw senderNorm=$senderNorm " +
        "allowlist=$allowlist matchMode=$matchMode"
    }
  }

  fun syncSettings(context: Context, enabled: Boolean, numbers: List<String>) {
    val normalized = numbers
      .map(::normalizeSender)
      .filter(String::isNotEmpty)
      .distinct()
    transact(context) { state ->
      state.put(KEY_ENABLED, enabled)
      state.put(KEY_NUMBERS, JSONArray(normalized).toString())
    }
  }

  fun describeSenderGate(context: Context, sender: String): SenderGateResult {
    val (enabled, numbers) = transact(context) { state ->
      state.optBoolean(KEY_ENABLED, false) to parseStringArray(state.str(KEY_NUMBERS))
    }
    val normalizedSender = normalizeSender(sender)
    if (!enabled) {
      return SenderGateResult(
        allowed = false,
        enabled = false,
        senderRaw = sender,
        senderNorm = normalizedSender,
        allowlist = numbers,
        matchMode = "disabled",
      )
    }
    if (normalizedSender.isEmpty()) {
      return SenderGateResult(
        allowed = false,
        enabled = true,
        senderRaw = sender,
        senderNorm = normalizedSender,
        allowlist = numbers,
        matchMode = "empty-norm",
      )
    }
    for (allowed in numbers) {
      when {
        normalizedSender == allowed -> {
          return SenderGateResult(
            allowed = true,
            enabled = true,
            senderRaw = sender,
            senderNorm = normalizedSender,
            allowlist = numbers,
            matchMode = "exact:$allowed",
          )
        }
        normalizedSender.endsWith(allowed) -> {
          return SenderGateResult(
            allowed = true,
            enabled = true,
            senderRaw = sender,
            senderNorm = normalizedSender,
            allowlist = numbers,
            matchMode = "senderEndsWithAllow:$allowed",
          )
        }
        allowed.endsWith(normalizedSender) -> {
          return SenderGateResult(
            allowed = true,
            enabled = true,
            senderRaw = sender,
            senderNorm = normalizedSender,
            allowlist = numbers,
            matchMode = "allowEndsWithSender:$allowed",
          )
        }
      }
    }
    return SenderGateResult(
      allowed = false,
      enabled = true,
      senderRaw = sender,
      senderNorm = normalizedSender,
      allowlist = numbers,
      matchMode = "none",
    )
  }

  fun isSenderAllowed(context: Context, sender: String): Boolean {
    return describeSenderGate(context, sender).allowed
  }

  fun isReceiveEnabled(context: Context): Boolean {
    return transact(context) { state -> state.optBoolean(KEY_ENABLED, false) }
  }

  fun allowedNumbers(context: Context): List<String> {
    return transact(context) { state -> parseStringArray(state.str(KEY_NUMBERS)) }
  }

  fun hasSupportedTransactionKeyword(body: String): Boolean {
    return SUPPORTED_TRANSACTION_KEYWORDS.any(body::contains)
  }

  fun enqueue(context: Context, sender: String, body: String, receivedAt: Long): Boolean {
    val trimmedBody = body.trim()
    val trimmedSender = sender.trim()
    if (trimmedBody.isEmpty() || trimmedSender.isEmpty()) {
      return false
    }

    return transact(context) { state ->
      enqueueLocked(state, trimmedSender, trimmedBody, receivedAt)
    }
  }

  private fun enqueueLocked(
    state: JSONObject,
    trimmedSender: String,
    trimmedBody: String,
    receivedAt: Long,
  ): Boolean {
    val now = System.currentTimeMillis()
    val fingerprint = fingerprint(trimmedSender, trimmedBody, receivedAt)
    val fingerprints = loadFingerprints(state.str(KEY_FINGERPRINTS), now)
    if (fingerprints.any { it.first == fingerprint }) {
      return false
    }

    val pending = loadPending(state.str(KEY_PENDING)).toMutableList()
    val id = UUID.randomUUID().toString()
    pending.add(
      PendingItem(
        id = id,
        sender = trimmedSender,
        body = trimmedBody,
        enqueuedAt = iso8601(receivedAt),
      ),
    )

    // ponytail: 대기 큐는 200건으로 제한한다. 실제 적체가 확인되면 파일 기반 큐로 확장한다.
    val boundedPending = pending.takeLast(MAX_PENDING_COUNT)
    val boundedFingerprints = (fingerprints + (fingerprint to now)).takeLast(MAX_FINGERPRINT_COUNT)
    state.put(KEY_PENDING, pendingToJson(boundedPending).toString())
    state.put(KEY_FINGERPRINTS, fingerprintsToJson(boundedFingerprints).toString())
    return true
  }

  fun peek(context: Context): List<PendingItem> {
    return transact(context) { state -> loadPending(state.str(KEY_PENDING)) }
  }

  fun acknowledge(context: Context, ids: Set<String>) {
    if (ids.isEmpty()) return
    transact(context) { state ->
      val remaining = loadPending(state.str(KEY_PENDING))
        .filterNot { ids.contains(it.id) }
      state.put(KEY_PENDING, pendingToJson(remaining).toString())
    }
  }

  fun clear(context: Context) {
    transact(context) { state ->
      state.keys().asSequence().toList().forEach(state::remove)
    }
  }

  /**
   * 프로세스 간 FileLock + 프로세스 내 @Synchronized(같은 JVM에서 FileLock 중복 획득 시 예외) 아래에서
   * 저장소를 디스크에서 읽고, [block]이 상태를 바꿨으면 원자적으로 다시 쓴다.
   */
  @Synchronized
  private fun <T> transact(context: Context, block: (JSONObject) -> T): T {
    val dir = context.applicationContext.filesDir
    RandomAccessFile(File(dir, LOCK_FILE), "rw").use { lockFile ->
      val lock = lockFile.channel.lock()
      try {
        val file = File(dir, STORE_FILE)
        val existed = file.exists()
        val state = if (existed) readState(file) else migrateLegacyPrefs(context)
        val before = state.toString()
        val result = block(state)
        val after = state.toString()
        if (!existed || after != before) {
          writeStateAtomic(file, after)
        }
        if (!existed) {
          context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().commit()
        }
        return result
      } finally {
        lock.release()
      }
    }
  }

  private fun readState(file: File): JSONObject {
    return try {
      JSONObject(file.readText(Charsets.UTF_8))
    } catch (_: Exception) {
      JSONObject()
    }
  }

  private fun writeStateAtomic(file: File, json: String) {
    val tmp = File(file.parentFile, "${file.name}.tmp")
    tmp.writeText(json, Charsets.UTF_8)
    if (!tmp.renameTo(file)) {
      file.writeText(json, Charsets.UTF_8)
      tmp.delete()
    }
  }

  private fun migrateLegacyPrefs(context: Context): JSONObject {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val state = JSONObject()
    if (prefs.contains(KEY_ENABLED)) state.put(KEY_ENABLED, prefs.getBoolean(KEY_ENABLED, false))
    prefs.getString(KEY_NUMBERS, null)?.let { state.put(KEY_NUMBERS, it) }
    prefs.getString(KEY_PENDING, null)?.let { state.put(KEY_PENDING, it) }
    prefs.getString(KEY_FINGERPRINTS, null)?.let { state.put(KEY_FINGERPRINTS, it) }
    return state
  }

  private fun JSONObject.str(key: String): String? = if (has(key)) optString(key) else null

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

  private fun fingerprint(sender: String, body: String, @Suppress("UNUSED_PARAMETER") receivedAt: Long): String {
    val source = "${normalizeSender(sender)}\u0000$body"
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
