package com.itour.rep

import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Reloads the JS bundle in place. Needed after I18nManager.forceRTL: React
 * Native only applies a layout-direction change when the root view is rebuilt.
 */
class AppRestartModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppRestart"

  @ReactMethod
  fun restart() {
    UiThreadUtil.runOnUiThread {
      val app = reactContext.applicationContext as ReactApplication
      app.reactNativeHost.reactInstanceManager.recreateReactContextInBackground()
    }
  }
}
