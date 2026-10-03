package com.ssong.awallet.widget

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.os.Build
import android.os.Handler
import android.provider.Settings
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil

/** 알림 수신 대상 로고 32dp @3x */
private const val LAUNCHER_ICON_PX = 96

class WidgetDataSyncModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String = "WidgetDataSync"

  override fun initialize() {
    super.initialize()
    RecordInboxNativeEventEmitter.attach(reactApplicationContext)
  }

  override fun invalidate() {
    RecordInboxNativeEventEmitter.detach(reactApplicationContext)
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
      RecordInboxNativeStore.syncSettings(
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
      RecordInboxNativeStore.peek(reactApplicationContext.applicationContext).forEach { item ->
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
      RecordInboxNativeStore.acknowledge(
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
      RecordInboxNativeStore.clear(reactApplicationContext.applicationContext)
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

  /** 홈 화면 아이콘이 있는 설치 앱 — `<queries>` LAUNCHER 선언으로 QUERY_ALL_PACKAGES 없이 조회 */
  @ReactMethod
  fun getLauncherApps(promise: Promise) {
    Thread {
      try {
        val context = reactApplicationContext.applicationContext
        val pm = context.packageManager
        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val seen = HashSet<String>()
        val result = Arguments.createArray()
        for (info in pm.queryIntentActivities(launcherIntent, 0)) {
          val packageName = info.activityInfo.packageName
          if (packageName == context.packageName || !seen.add(packageName)) continue
          val app = Arguments.createMap()
          app.putString("packageName", packageName)
          app.putString("label", info.loadLabel(pm).toString())
          app.putString("icon", drawableToPngDataUri(info.loadIcon(pm)))
          result.pushMap(app)
        }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("ERROR", "Failed to load launcher apps: ${e.message}", e)
      }
    }.start()
  }

  private fun drawableToPngDataUri(drawable: Drawable): String {
    val size = LAUNCHER_ICON_PX
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, size, size)
    drawable.draw(canvas)
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    bitmap.recycle()
    return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    try {
      val enabled = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        (reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager)
          .canScheduleExactAlarms()
      promise.resolve(enabled)
    } catch (e: Exception) {
      promise.reject("ERROR", "Failed to check exact alarm permission: ${e.message}", e)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val context = reactApplicationContext.applicationContext
      val packageUri = Uri.parse("package:${context.packageName}")
      try {
        val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM
        } else {
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS
        }
        context.startActivity(Intent(action, packageUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(null)
      } catch (e: Exception) {
        try {
          context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
          promise.resolve(null)
        } catch (fallbackError: Exception) {
          promise.reject("ERROR", "Failed to open exact alarm settings: ${fallbackError.message}", fallbackError)
        }
      }
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit
}
