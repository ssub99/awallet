package com.ssong.awallet.widget

import android.content.Context
import android.content.Intent
import com.ssong.awallet.MainActivity

/** 위젯·trampoline 공통 — 아이콘 실행과 동일한 Main launch intent */
object WidgetLauncherIntents {
  fun createBringForwardIntent(context: Context): Intent {
    val intent = createBaseLauncherIntent(context)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    return intent
  }

  fun createColdStartIntent(context: Context): Intent {
    val intent = createBaseLauncherIntent(context)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (intent.flags and Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED == 0) {
      intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    }
    return intent
  }

  fun createColdStartIntentFromTrampoline(context: Context): Intent =
    Intent(context, MainActivity::class.java).apply {
      action = Intent.ACTION_MAIN
      addCategory(Intent.CATEGORY_LAUNCHER)
      putExtra(WidgetLaunchExtras.EXTRA_FROM_WIDGET_TRAMPOLINE, true)
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED or
          Intent.FLAG_ACTIVITY_NO_ANIMATION,
      )
    }

  private fun createBaseLauncherIntent(context: Context): Intent {
    return context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_MAIN
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
  }
}
