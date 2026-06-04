package com.ssong.awallet.widget

import android.app.Activity
import android.graphics.PixelFormat
import android.os.SystemClock
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import com.ssong.awallet.R

/**
 * 위젯 cold start — RN SurfaceView 위에 올리는 풀스크린 스플래시 (WindowManager).
 * decor addView 는 Fabric Surface 아래로 깔려 검정 화면이 보일 수 있습니다.
 */
object WidgetMainSplashOverlay {
  private var overlayView: View? = null
  private var attachedAtElapsedMs: Long = 0L

  fun isShowing(): Boolean = overlayView != null

  fun attach(activity: Activity) {
    if (overlayView != null) {
      return
    }

    val decor = activity.window.decorView
    if (!decor.isAttachedToWindow) {
      decor.post { attach(activity) }
      return
    }

    val wm = activity.windowManager
    val overlay = LayoutInflater.from(activity).inflate(R.layout.widget_splash_trampoline, null)
    val params =
      WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_PANEL,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
          WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.OPAQUE,
      ).apply {
        gravity = Gravity.FILL
        token = decor.applicationWindowToken
      }

    try {
      wm.addView(overlay, params)
      overlayView = overlay
      attachedAtElapsedMs = SystemClock.elapsedRealtime()
      WidgetDebugLog.d("WidgetMainSplashOverlay attach (WindowManager)")
    } catch (e: Exception) {
      WidgetDebugLog.d("WidgetMainSplashOverlay WM 실패, decor fallback: ${e.message}")
      attachDecorFallback(activity, overlay)
    }
  }

  private fun attachDecorFallback(activity: Activity, overlay: View) {
    val decor = activity.window.decorView as? android.view.ViewGroup ?: return
    if (decor.findViewWithTag<View>(VIEW_TAG) != null) {
      return
    }
    overlay.tag = VIEW_TAG
    decor.addView(
      overlay,
      android.view.ViewGroup.LayoutParams(
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
    overlay.bringToFront()
    overlayView = overlay
    attachedAtElapsedMs = SystemClock.elapsedRealtime()
    WidgetDebugLog.d("WidgetMainSplashOverlay attach (decor fallback)")
  }

  private const val VIEW_TAG = "WidgetMainSplashOverlay"

  fun dismiss(activity: Activity) {
    val view = overlayView ?: return
    val remaining = WidgetLaunchExtras.SPLASH_DURATION_MS - (SystemClock.elapsedRealtime() - attachedAtElapsedMs)
    if (remaining > 0L) {
      WidgetDebugLog.d("WidgetMainSplashOverlay dismiss 지연 ${remaining}ms (최소 2초)")
      decorSafePost(activity, remaining) { dismissNow(activity) }
      return
    }
    dismissNow(activity)
  }

  fun dismissImmediate(activity: Activity) {
    dismissNow(activity)
  }

  private fun dismissNow(activity: Activity) {
    val view = overlayView ?: return
    if (activity.isFinishing || activity.isDestroyed) {
      overlayView = null
      attachedAtElapsedMs = 0L
      return
    }
    try {
      activity.windowManager.removeView(view)
    } catch (_: Exception) {
      try {
        (view.parent as? android.view.ViewGroup)?.removeView(view)
      } catch (_: Exception) {
        // already removed
      }
    }
    overlayView = null
    attachedAtElapsedMs = 0L
    WidgetDebugLog.d("WidgetMainSplashOverlay dismiss")
  }

  private fun decorSafePost(activity: Activity, delayMs: Long, block: () -> Unit) {
    activity.window.decorView.postDelayed(block, delayMs)
  }
}
