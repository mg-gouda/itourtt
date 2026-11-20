package com.itour.rep

import android.app.DownloadManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * In-app updates for the sideloaded APK (not on Google Play). JS checks
 * /api/public/apps/latest, then:
 *   download(url) → Android DownloadManager (progress also in the tray) → status(id) polled →
 *   install(id) opens the system installer. Android asks the user to allow
 *   "install unknown apps" for this app once (canInstall / openInstallSettings).
 * The installer itself always asks the user to confirm; nothing installs silently.
 */
class AppUpdateModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppUpdate"

  override fun getConstants(): MutableMap<String, Any> =
      hashMapOf("versionName" to BuildConfig.VERSION_NAME, "versionCode" to BuildConfig.VERSION_CODE)

  private val dm: DownloadManager
    get() = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  @ReactMethod
  fun download(url: String, title: String, promise: Promise) {
    try {
      val dir = reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
      File(dir, FILE_NAME).delete()
      val req = DownloadManager.Request(Uri.parse(url))
          .setTitle(title)
          .setMimeType(APK_MIME)
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
          .setDestinationInExternalFilesDir(reactContext, Environment.DIRECTORY_DOWNLOADS, FILE_NAME)
      promise.resolve(dm.enqueue(req).toString())
    } catch (e: Exception) {
      promise.reject("DOWNLOAD_FAILED", e.message, e)
    }
  }

  /** { status: pending | running | paused | done | failed, downloaded, total } */
  @ReactMethod
  fun status(id: String, promise: Promise) {
    try {
      dm.query(DownloadManager.Query().setFilterById(id.toLong())).use { c ->
        val out = Arguments.createMap()
        if (!c.moveToFirst()) {
          out.putString("status", "failed")
          out.putDouble("downloaded", 0.0)
          out.putDouble("total", 0.0)
          promise.resolve(out)
          return
        }
        val st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        out.putString(
            "status",
            when (st) {
              DownloadManager.STATUS_SUCCESSFUL -> "done"
              DownloadManager.STATUS_FAILED -> "failed"
              DownloadManager.STATUS_PAUSED -> "paused"
              DownloadManager.STATUS_RUNNING -> "running"
              else -> "pending"
            },
        )
        out.putDouble("downloaded", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)).toDouble())
        out.putDouble("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)).toDouble())
        promise.resolve(out)
      }
    } catch (e: Exception) {
      promise.reject("STATUS_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun canInstall(promise: Promise) {
    promise.resolve(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.packageManager.canRequestPackageInstalls() else true,
    )
  }

  /** Android 8+: the "Install unknown apps" switch for this app. */
  @ReactMethod
  fun openInstallSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + reactContext.packageName))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun install(id: String, promise: Promise) {
    try {
      val uri = dm.getUriForDownloadedFile(id.toLong())
      if (uri == null) {
        promise.reject("NOT_DOWNLOADED", "The update has not finished downloading")
        return
      }
      val intent = Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, APK_MIME)
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      (currentActivity ?: reactContext).startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("INSTALL_FAILED", e.message, e)
    }
  }

  /** Android 14+: may job alarms show full-screen over the lock screen? */
  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    if (Build.VERSION.SDK_INT >= 34) {
      val nm = reactContext.getSystemService(NotificationManager::class.java)
      promise.resolve(nm?.canUseFullScreenIntent() ?: true)
    } else {
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun openFullScreenIntentSettings() {
    if (Build.VERSION.SDK_INT < 34) return
    val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + reactContext.packageName))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
  }

  companion object {
    private const val FILE_NAME = "itour-update.apk"
    private const val APK_MIME = "application/vnd.android.package-archive"
  }
}
