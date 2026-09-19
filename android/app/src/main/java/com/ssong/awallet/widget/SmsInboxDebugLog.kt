package com.ssong.awallet.widget

import android.util.Log

/**
 * 문자 수신 게이트 진단용 Logcat.
 * 필터: `adb logcat -s AwalletSmsInbox`
 *
 * ponytail: 원인 규명용 임시 로그. 규명 후 제거하거나 BuildConfig.DEBUG로 좁힌다.
 */
object SmsInboxDebugLog {
  const val TAG = "AwalletSmsInbox"

  fun i(message: String) {
    Log.i(TAG, message)
  }

  fun previewBody(body: String, maxChars: Int = 48): String {
    val compact = body.replace('\n', ' ').replace('\r', ' ').trim()
    if (compact.length <= maxChars) return compact
    return compact.take(maxChars) + "…"
  }
}
