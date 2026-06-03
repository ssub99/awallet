package com.ssong.awallet.widget

import android.content.Context
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/**
 * iOS App Group UserDefaults와 동일한 키·JSON 스키마를 사용합니다.
 * (Android는 flavor별 applicationId로 prefs가 자동 분리됩니다.)
 */
object WidgetDataStore {
  const val PREFS_NAME = "awallet_widget"
  const val KEY_MONTHLY_EXPENSE_DATA = "monthlyExpenseData"
  const val KEY_REVEAL_STATE = "monthlyExpenseRevealState"
  const val KEY_REVEAL_UNTIL = "monthlyExpenseRevealUntil"

  const val REVEAL_DURATION_MS = 5_000L

  data class MonthlyExpenseData(
    val expense: Double,
    val income: Double,
    val balance: Double,
    val monthStartDay: Int,
    val lastUpdated: Long,
  )

  fun saveMonthlyExpenseData(
    context: Context,
    expense: Double,
    income: Double,
    balance: Double,
    monthStartDay: Int,
  ) {
    val json = JSONObject()
      .put("expense", expense)
      .put("income", income)
      .put("balance", balance)
      .put("monthStartDay", monthStartDay)
      .put("lastUpdated", System.currentTimeMillis())

    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_MONTHLY_EXPENSE_DATA, json.toString())
      .apply()
  }

  fun loadMonthlyExpenseData(context: Context): MonthlyExpenseData? {
    val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_MONTHLY_EXPENSE_DATA, null) ?: return null

    return try {
      val json = JSONObject(raw)
      MonthlyExpenseData(
        expense = json.getDouble("expense"),
        income = json.getDouble("income"),
        balance = json.getDouble("balance"),
        monthStartDay = json.optInt("monthStartDay", 1),
        lastUpdated = json.optLong("lastUpdated", 0L),
      )
    } catch (_: Exception) {
      null
    }
  }

  fun setRevealed(context: Context, revealed: Boolean) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val editor = prefs.edit()
    if (revealed) {
      editor.putBoolean(KEY_REVEAL_STATE, true)
      editor.putLong(KEY_REVEAL_UNTIL, System.currentTimeMillis() + REVEAL_DURATION_MS)
    } else {
      editor.putBoolean(KEY_REVEAL_STATE, false)
      editor.remove(KEY_REVEAL_UNTIL)
    }
    editor.apply()
  }

  fun clearRevealState(context: Context) {
    setRevealed(context, false)
  }

  /** iOS loadEntry()와 동일: 만료 시 키 정리 후 false */
  fun isRevealed(context: Context): Boolean {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val revealUntil = prefs.getLong(KEY_REVEAL_UNTIL, 0L)
    val revealState = prefs.getBoolean(KEY_REVEAL_STATE, false)
    val now = System.currentTimeMillis()

    if (revealState && revealUntil > now) {
      return true
    }

    if (!revealState || revealUntil <= now) {
      prefs.edit()
        .putBoolean(KEY_REVEAL_STATE, false)
        .remove(KEY_REVEAL_UNTIL)
        .apply()
    }
    return false
  }

  fun formatExpenseText(context: Context): String {
    val data = loadMonthlyExpenseData(context)
    val value = data?.expense?.toLong() ?: 0L
    val formatter = NumberFormat.getNumberInstance(Locale.KOREA).apply {
      maximumFractionDigits = 0
      minimumFractionDigits = 0
    }
    return "${formatter.format(value)}원"
  }

}
