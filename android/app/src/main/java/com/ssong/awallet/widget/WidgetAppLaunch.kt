package com.ssong.awallet.widget

import android.content.Context
import android.content.Intent
import com.ssong.awallet.MainActivity

/**
 * 위젯에서 앱 실행.
 * - `singleTask` + NEW_TASK | CLEAR_TOP: 기존 인스턴스는 [onNewIntent], cold start는 [onCreate]
 * - CLEAR_TASK / `awallet:///` VIEW는 dev에서 Expo Router linking 중복 에러를 유발할 수 있음
 */
object WidgetAppLaunch {
  const val EXTRA_LAUNCHED_FROM_WIDGET = "com.ssong.awallet.widget.LAUNCHED_FROM_WIDGET"

  fun buildLaunchIntent(context: Context): Intent {
    return Intent(context, MainActivity::class.java).apply {
      putExtra(EXTRA_LAUNCHED_FROM_WIDGET, true)
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP,
      )
    }
  }
}
