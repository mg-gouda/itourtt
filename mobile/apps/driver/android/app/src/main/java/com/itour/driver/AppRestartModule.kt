package com.itour.driver

import android.content.Intent
import android.os.Process
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Restarts the app after I18nManager.forceRTL: React Native only applies a
 * layout-direction change to a freshly started app.
 *
 * This is a full process restart (via [RestartActivity] in its own process),
 * not an in-place JS reload. Recreating the React context in place left the
 * old context's foreground service and native modules attached to a dead JS
 * instance, and the reloaded app stopped loading data after switching to
 * Arabic. A cold start is exactly what a user gets when reopening the app.
 */
class AppRestartModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppRestart"

  @ReactMethod
  fun restart() {
    val ctx = currentActivity ?: reactContext
    val intent = Intent(ctx, RestartActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .putExtra(RestartActivity.EXTRA_PID, Process.myPid())
    ctx.startActivity(intent)
  }
}
