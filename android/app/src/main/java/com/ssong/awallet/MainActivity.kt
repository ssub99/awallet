package com.ssong.awallet
import expo.modules.splashscreen.SplashScreenManager

import android.content.Intent
import android.os.Build
import android.os.Bundle

import androidx.appcompat.app.AppCompatDelegate
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import com.ssong.awallet.R
import com.ssong.awallet.widget.ExpoSplashScreenReset
import com.ssong.awallet.widget.MainActivityHolder
import com.ssong.awallet.widget.MainActivityLifecycle
import com.ssong.awallet.widget.WidgetDebugLog
import com.ssong.awallet.widget.WidgetLaunchExtras
import com.ssong.awallet.widget.WidgetLaunchPrefs
import com.ssong.awallet.widget.WidgetMainSplashOverlay
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onStart() {
    super.onStart()
    MainActivityLifecycle.onMainActivityStarted()
  }

  override fun onStop() {
    MainActivityLifecycle.onMainActivityStopped()
    super.onStop()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
    WidgetDebugLog.d(
      "MainActivity.onCreate savedInstanceState=${savedInstanceState != null}",
    )
    ExpoSplashScreenReset.resetBeforeRegisterOnActivity()
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    // react-native-screens: process death 시 ScreenFragment 복원 크래시 방지
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(null)
    MainActivityHolder.attach(this)
    if (!shouldShowWidgetColdSplash(intent)) {
      WidgetLaunchPrefs.clearTrampolineSplashPending(applicationContext)
    }
    applyWidgetColdSplashIfNeeded(intent)
  }

  override fun onDestroy() {
    if (WidgetMainSplashOverlay.isShowing()) {
      WidgetMainSplashOverlay.dismissImmediate(this)
    }
    MainActivityHolder.detach(this)
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    WidgetDebugLog.d("MainActivity.onNewIntent")
    super.onNewIntent(intent)
    setIntent(intent)
    applyWidgetColdSplashIfNeeded(intent)
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      super.invokeDefaultOnBackPressed()
  }

  private fun isWidgetColdIntent(intent: Intent?): Boolean =
    intent?.getBooleanExtra(WidgetLaunchExtras.EXTRA_FROM_WIDGET_TRAMPOLINE, false) == true

  private fun shouldShowWidgetColdSplash(intent: Intent?): Boolean =
    isWidgetColdIntent(intent) ||
      WidgetLaunchPrefs.peekTrampolineSplashPending(applicationContext)

  private fun applyWidgetColdSplashIfNeeded(intent: Intent?) {
    if (!shouldShowWidgetColdSplash(intent)) {
      return
    }
    if (isWidgetColdIntent(intent)) {
      intent?.removeExtra(WidgetLaunchExtras.EXTRA_FROM_WIDGET_TRAMPOLINE)
    }
    window.setBackgroundDrawableResource(R.color.splashscreen_background)
    WidgetDebugLog.d("위젯 cold: window 배경 흰색 + WindowManager 스플래시")
    WidgetMainSplashOverlay.attach(this)
  }
}
