package com.ssong.awallet.widget

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil

class WidgetDataSyncModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String = "WidgetDataSync"

  override fun initialize() {
    super.initialize()
    SmsInboxNativeEventEmitter.attach(reactApplicationContext)
  }

  override fun invalidate() {
    SmsInboxNativeEventEmitter.detach(reactApplicationContext)
    super.invalidate()
  }

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
  fun dismissWidgetMainSplashOverlay(promise: Promise) {
    mainHandler.post {
      try {
        val activity = reactApplicationContext.currentActivity
        if (activity != null) {
          WidgetMainSplashOverlay.dismiss(activity)
        }
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERROR", "Failed to dismiss widget splash overlay: ${e.message}", e)
      }
    }
  }

  @ReactMethod
  fun consumeWidgetTrampolineSplash(promise: Promise) {
    try {
      val consumed =
        WidgetLaunchPrefs.consumeTrampolineSplashPending(reactApplicationContext.applicationContext)
      promise.resolve(consumed)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to consume trampoline splash flag: ${e.message}", e)
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

  @ReactMethod
  fun syncSmsReceiveSettings(enabled: Boolean, numbers: ReadableArray, promise: Promise) {
    try {
      val values = buildList {
        for (index in 0 until numbers.size()) {
          numbers.getString(index)?.let(::add)
        }
      }
      SmsInboxNativeStore.syncSettings(
        reactApplicationContext.applicationContext,
        enabled,
        values,
      )
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to sync SMS receive settings: ${e.message}", e)
    }
  }

  @ReactMethod
  fun getPendingSmsInbox(promise: Promise) {
    try {
      val result = Arguments.createArray()
      SmsInboxNativeStore.peek(reactApplicationContext.applicationContext).forEach { item ->
        result.pushMap(
          Arguments.createMap().apply {
            putString("id", item.id)
            putString("sender", item.sender)
            putString("body", item.body)
            putString("enqueuedAt", item.enqueuedAt)
          },
        )
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to get pending SMS inbox: ${e.message}", e)
    }
  }

  @ReactMethod
  fun acknowledgePendingSmsInbox(ids: ReadableArray, promise: Promise) {
    try {
      val values = buildSet {
        for (index in 0 until ids.size()) {
          ids.getString(index)?.let(::add)
        }
      }
      SmsInboxNativeStore.acknowledge(
        reactApplicationContext.applicationContext,
        values,
      )
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to acknowledge pending SMS inbox: ${e.message}", e)
    }
  }

  @ReactMethod
  fun clearSmsInboxNativeState(promise: Promise) {
    try {
      SmsInboxNativeStore.clear(reactApplicationContext.applicationContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to clear native SMS inbox state: ${e.message}", e)
    }
  }

  @ReactMethod
  fun isSmsInboxNotificationAccessEnabled(promise: Promise) {
    try {
      val enabled = SmsInboxNotificationListener.isNotificationAccessEnabled(
        reactApplicationContext.applicationContext,
      )
      promise.resolve(enabled)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to check notification access: ${e.message}", e)
    }
  }

  @ReactMethod
  fun openSmsInboxNotificationAccessSettings(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        SmsInboxNotificationListener.openNotificationAccessSettings(
          reactApplicationContext.applicationContext,
        )
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERROR", "Failed to open notification access settings: ${e.message}", e)
      }
    }
  }

  @ReactMethod
  fun areDefaultSmsAppNotificationsEnabled(promise: Promise) {
    try {
      val enabled = SmsInboxNotificationListener.areDefaultSmsNotificationsEnabled(
        reactApplicationContext.applicationContext,
      )
      promise.resolve(enabled)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to check SMS app notifications: ${e.message}", e)
    }
  }

  @ReactMethod
  fun openDefaultSmsAppNotificationSettings(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        SmsInboxNotificationListener.openDefaultSmsNotificationSettings(
          reactApplicationContext.applicationContext,
        )
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERROR", "Failed to open SMS app notification settings: ${e.message}", e)
      }
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit
}
