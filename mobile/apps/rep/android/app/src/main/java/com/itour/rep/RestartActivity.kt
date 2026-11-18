package com.itour.rep

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Process

/**
 * Runs in a separate ":restart" process: kills the main app process, then
 * launches the app fresh and exits. Started from the foreground activity, so
 * Android's background-activity-start limits don't apply.
 */
class RestartActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pid = intent.getIntExtra(EXTRA_PID, -1)
    if (pid > 0) Process.killProcess(pid)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch != null) {
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      startActivity(launch)
    }
    finish()
    Runtime.getRuntime().exit(0)
  }

  companion object {
    const val EXTRA_PID = "main_pid"
  }
}
