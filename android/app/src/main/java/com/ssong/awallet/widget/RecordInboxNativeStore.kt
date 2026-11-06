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
object RecordInboxNativeStore {
  /** 이전 버전 저장소. 최초 1회 파일로 이전 후 비운다. */
  private const val PREFS_NAME = "awallet_sms_inbox_native"
  private const val STORE_FILE = "awallet_sms_inbox_native.json"
  private const val LOCK_FILE = "awallet_sms_inbox_native.lock"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_NUMBERS = "numbers"
  private const val KEY_PENDING = "pending"
  private const val KEY_FINGERPRINTS = "fingerprints"
  private const val KEY_APP_ENABLED = "appEnabled"
  private const val KEY_APP_PACKAGES = "appPackages"
  /** JS가 확정한 수신함 실건수. 아이콘 뱃지 = lastSynced + pending.size */
  private const val KEY_LAST_SYNCED = "lastSyncedInboxCount"
  /** 뱃지 알림 탭 → 앱 기동 후 수신함 오픈 1회 소비 */
  private const val KEY_OPEN_RECORD_INBOX_PENDING = "openRecordInboxPending"
  const val SOURCE_APP = "app"
  private const val MAX_PENDING_COUNT = 200
  private const val MAX_FINGERPRINT_COUNT = 400
  private const val FINGERPRINT_TTL_MS = 7L * 24L * 60L * 60L * 1000L

  data class PendingItem(
    val id: String,
    val sender: String,
    val body: String,
    val enqueuedAt: String,
    /** "app" = 앱 알림 수신. 빈 값은 문자 */
    val source: String = "",
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

  fun syncAppNotificationSettings(context: Context, enabled: Boolean, packages: List<String>) {
    transact(context) { state ->
      state.put(KEY_APP_ENABLED, enabled)
      state.put(KEY_APP_PACKAGES, JSONArray(packages.filter(String::isNotBlank).distinct()).toString())
    }
  }

  fun isAppNotificationTarget(context: Context, packageName: String): Boolean {
    return transact(context) { state ->
      state.optBoolean(KEY_APP_ENABLED, false) &&
        parseStringArray(state.str(KEY_APP_PACKAGES)).contains(packageName)
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

  fun enqueue(
    context: Context,
    sender: String,
    body: String,
    receivedAt: Long,
    source: String = "",
    /** 앱 알림 등 게시 건별 고유키 (StatusBarNotification.key). 동일 본문 연속 결제 유실 방지. */
    eventKey: String? = null,
  ): Boolean {
    val trimmedBody = body.trim()
    val trimmedSender = sender.trim()
    if (trimmedBody.isEmpty() || trimmedSender.isEmpty()) {
      return false
    }

    val enqueued = transact(context) { state ->
      enqueueLocked(state, trimmedSender, trimmedBody, receivedAt, source, eventKey)
    }
    if (enqueued) {
      RecordInboxBadgeNotifier.refreshFromStore(context)
    }
    return enqueued
  }

  /** 아이콘 뱃지 힌트: JS 확정 건수 + 아직 flush 안 된 pending */
  fun iconBadgeCount(context: Context): Int {
    return transact(context) { state ->
      val synced = state.optInt(KEY_LAST_SYNCED, 0).coerceAtLeast(0)
      synced + loadPending(state.str(KEY_PENDING)).size
    }
  }

  /**
   * JS가 확정한 수신함 실건수.
   * 뱃지는 [count]만 반영 (flush 중 write→ack 사이에 pending이 남아도 이중 집계하지 않음).
   * 앱 종료 후 enqueue 시는 [iconBadgeCount] = lastSynced + pending.
   */
  fun setLastSyncedInboxCount(context: Context, count: Int) {
    val safe = count.coerceAtLeast(0)
    transact(context) { state ->
      state.put(KEY_LAST_SYNCED, safe)
    }
    RecordInboxBadgeNotifier.update(context, safe)
  }

  fun markOpenRecordInboxPending(context: Context) {
    transact(context) { state ->
      state.put(KEY_OPEN_RECORD_INBOX_PENDING, true)
    }
  }

  fun consumeOpenRecordInboxPending(context: Context): Boolean {
    return transact(context) { state ->
      val pending = state.optBoolean(KEY_OPEN_RECORD_INBOX_PENDING, false)
      if (pending) {
        state.put(KEY_OPEN_RECORD_INBOX_PENDING, false)
      }
      pending
    }
  }

  private fun enqueueLocked(
    state: JSONObject,
    trimmedSender: String,
    trimmedBody: String,
    receivedAt: Long,
    source: String,
    eventKey: String? = null,
  ): Boolean {
    val now = System.currentTimeMillis()
    // 앱 알림: sbn.key 우선 — 본문이 같아도 연속 결제 2건을 각각 적재.
    // 문자: sender+body (재전달 중복 방지). receivedAt은 지문 미사용(의도적).
    val fingerprint = when {
      !eventKey.isNullOrBlank() -> fingerprint("event:$eventKey", "", receivedAt, rawSender = true)
      source == SOURCE_APP -> fingerprint("$SOURCE_APP:$trimmedSender", trimmedBody, receivedAt, rawSender = true)
      else -> fingerprint(trimmedSender, trimmedBody, receivedAt)
    }
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
        source = source,
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
    RecordInboxBadgeNotifier.cancel(context)
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
              source = item.optString("source"),
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
            .put("enqueuedAt", item.enqueuedAt)
            .apply { if (item.source.isNotEmpty()) put("source", item.source) },
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

  private fun fingerprint(
    sender: String,
    body: String,
    @Suppress("UNUSED_PARAMETER") receivedAt: Long,
    rawSender: Boolean = false,
  ): String {
    val source = "${if (rawSender) sender else normalizeSender(sender)}\u0000$body"
    return MessageDigest.getInstance("SHA-256")
      .digest(source.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
  }

  private fun iso8601(timestamp: Long): String {
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(timestamp))
  }

  private val SUPPORTED_TRANSACTION_KEYWORDS = listOf("취소", "승인", "출금")
}
