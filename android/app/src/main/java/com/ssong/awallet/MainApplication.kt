package com.ssong.awallet
import com.facebook.react.common.assets.ReactFontManager

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import java.io.File

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import com.ssong.awallet.widget.WidgetDataSyncPackage
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override fun attachBaseContext(base: Context) {
    val configuration = Configuration(base.resources.configuration)
    configuration.fontScale = 1.0f
    val context = base.createConfigurationContext(configuration)
    super.attachBaseContext(context)
  }

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(WidgetDataSyncPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    // :sms_listener(알림 리스너 전용 프로세스)에서는 RN·Expo(업데이트 DB 등)를 초기화하지 않는다.
    if (!isMainProcess()) return
    // @generated begin xml-fonts-init - expo prebuild (DO NOT MODIFY) sync-99ab81495dc2b574e4020773e2fdb72f72e32286
    ReactFontManager.getInstance().addCustomFont(this, "Pretendard", R.font.xml_pretendard)
    // @generated end xml-fonts-init
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (!isMainProcess()) return
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  private fun isMainProcess(): Boolean {
    val processName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      Application.getProcessName()
    } else {
      try {
        File("/proc/self/cmdline").readText().trim('\u0000', ' ', '\n')
      } catch (_: Exception) {
        packageName
      }
    }
    return processName == packageName
  }
}
