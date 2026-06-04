package com.ssong.awallet.widget

import android.content.Intent
import android.util.Log
import com.ssong.awallet.BuildConfig

/** 위젯·스플래시 진입 경로 디버깅 (BuildConfig.DEBUG 일 때만 Logcat 출력) */
object WidgetDebugLog {
  const val TAG = "AwalletWidget"

  fun d(message: String) {
    if (BuildConfig.DEBUG) {
      Log.d(TAG, message)
    }
  }

  fun environment(contextPackage: String) {
    d(
      "env DEBUG=${BuildConfig.DEBUG} " +
        "BUILD_TYPE=${BuildConfig.BUILD_TYPE} " +
        "APP_ID=${BuildConfig.APPLICATION_ID} " +
        "contextPkg=$contextPackage",
    )
  }

  fun intentFlags(label: String, flags: Int) {
    d(
      "$label flags=0x${Integer.toHexString(flags)} " +
        "NEW_TASK=${hasFlag(flags, Intent.FLAG_ACTIVITY_NEW_TASK)} " +
        "CLEAR_TOP=${hasFlag(flags, Intent.FLAG_ACTIVITY_CLEAR_TOP)} " +
        "CLEAR_TASK=${hasFlag(flags, Intent.FLAG_ACTIVITY_CLEAR_TASK)} " +
        "REORDER_TO_FRONT=${hasFlag(flags, Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)} " +
        "RESET_TASK_IF_NEEDED=${hasFlag(flags, Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)}",
    )
  }

  private fun hasFlag(flags: Int, flag: Int): Boolean = flags and flag != 0
}
