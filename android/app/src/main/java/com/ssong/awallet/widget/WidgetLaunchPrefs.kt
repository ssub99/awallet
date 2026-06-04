package com.ssong.awallet.widget

import android.content.Context

/** 위젯 trampoline → Main handoff 시 JS prepare() 중복 2초 대기 스킵용 (1회 소비) */
object WidgetLaunchPrefs {
  private const val PREFS_NAME = WidgetDataStore.PREFS_NAME
  private const val KEY_PENDING_TRAMPOLINE_SPLASH = "widgetTrampolineSplashPending"

  fun markTrampolineSplashPending(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_PENDING_TRAMPOLINE_SPLASH, true)
      .commit()
  }

  fun peekTrampolineSplashPending(context: Context): Boolean =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getBoolean(KEY_PENDING_TRAMPOLINE_SPLASH, false)

  fun clearTrampolineSplashPending(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_PENDING_TRAMPOLINE_SPLASH)
      .apply()
  }

  fun consumeTrampolineSplashPending(context: Context): Boolean {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(KEY_PENDING_TRAMPOLINE_SPLASH, false)) {
      return false
    }
    prefs.edit().remove(KEY_PENDING_TRAMPOLINE_SPLASH).apply()
    return true
  }
}
