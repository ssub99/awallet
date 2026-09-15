package com.ssong.awallet.widget

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

object SmsInboxNativeEventEmitter {
  const val EVENT_PENDING_ENQUEUED = "SmsInboxPendingEnqueued"

  private var reactContextRef: WeakReference<ReactApplicationContext>? = null

  fun attach(reactContext: ReactApplicationContext) {
    reactContextRef = WeakReference(reactContext)
  }

  fun detach(reactContext: ReactApplicationContext) {
    if (reactContextRef?.get() === reactContext) {
      reactContextRef = null
    }
  }

  fun emitPendingEnqueued() {
    val reactContext = reactContextRef?.get() ?: return
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_PENDING_ENQUEUED, null)
  }
}
