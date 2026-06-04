package com.ssong.awallet.widget

/**
 * MainActivity 가 화면에 떠 있는지(onStart~onStop) 추적.
 * 위젯 진입 시 cold start(스플래시) vs 포그라운드 복귀를 구분합니다.
 */
object MainActivityLifecycle {
  @Volatile
  var isStarted: Boolean = false
    private set

  fun onMainActivityStarted() {
    isStarted = true
    WidgetDebugLog.d("MainActivityLifecycle.isStarted=true")
  }

  fun onMainActivityStopped() {
    isStarted = false
    WidgetDebugLog.d("MainActivityLifecycle.isStarted=false")
  }
}
