package com.ssong.awallet.widget

import com.ssong.awallet.MainActivity
import java.lang.ref.WeakReference

/** singleTask MainActivity 가 onStop 된 뒤에도 인스턴스가 남는지 추적 */
object MainActivityHolder {
  private var ref: WeakReference<MainActivity>? = null

  val current: MainActivity?
    get() = ref?.get()

  fun attach(activity: MainActivity) {
    ref = WeakReference(activity)
  }

  fun detach(activity: MainActivity) {
    if (ref?.get() === activity) {
      ref = null
    }
  }
}
