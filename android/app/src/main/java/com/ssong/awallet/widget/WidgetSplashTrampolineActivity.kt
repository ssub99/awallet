package com.ssong.awallet.widget

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.ssong.awallet.R

/**
 * 위젯 cold start 전용 trampoline — React 없음, 스플래시만 표시 후 런처와 동일 intent 로 Main.
 * Main 의 edge-to-edge / window 는 건드리지 않습니다.
 */
class WidgetSplashTrampolineActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    WidgetDebugLog.d("WidgetSplashTrampoline onCreate ${WidgetLaunchExtras.SPLASH_DURATION_MS}ms")
    super.onCreate(savedInstanceState)
    setContentView(R.layout.widget_splash_trampoline)

    window.decorView.postDelayed({
      WidgetDebugLog.d("WidgetSplashTrampoline → Main (런처 intent + 오버레이)")
      WidgetLaunchPrefs.markTrampolineSplashPending(applicationContext)
      startActivity(WidgetLauncherIntents.createColdStartIntentFromTrampoline(this))
      finish()
      @Suppress("DEPRECATION")
      overridePendingTransition(0, 0)
    }, WidgetLaunchExtras.SPLASH_DURATION_MS)
  }
}
