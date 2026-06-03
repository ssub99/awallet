package com.ssong.awallet.widget

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class WidgetDataSyncModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String = "WidgetDataSync"

  @ReactMethod
  fun saveMonthlyExpenseData(data: ReadableMap, promise: Promise) {
    try {
      if (!data.hasKey("expense") || !data.hasKey("income") || !data.hasKey("balance")) {
        promise.reject("ERROR", "Invalid data format (expense/income/balance)")
        return
      }

      val expense = data.getDouble("expense")
      val income = data.getDouble("income")
      val balance = data.getDouble("balance")
      val monthStartDay = if (data.hasKey("monthStartDay")) data.getInt("monthStartDay") else 1

      val context = reactApplicationContext.applicationContext
      WidgetDataStore.saveMonthlyExpenseData(
        context,
        expense,
        income,
        balance,
        monthStartDay,
      )

      // iOS WidgetDataSync.swift와 동일: 짧은 지연 후 위젯 갱신
      mainHandler.postDelayed({
        MonthlyExpenseWidgetUpdater.updateAll(context)
        promise.resolve(null)
      }, 250L)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to save monthly expense data: ${e.message}", e)
    }
  }

  @ReactMethod
  fun clearMonthlyExpenseRevealState(promise: Promise) {
    try {
      val context = reactApplicationContext.applicationContext
      WidgetRevealScheduler.cancelRemask(context)
      WidgetDataStore.clearRevealState(context)
      MonthlyExpenseWidgetUpdater.updateAll(context)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to clear reveal state: ${e.message}", e)
    }
  }
}
