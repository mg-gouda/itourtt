package com.itour.rep

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Alarm sounds uploaded in Company › Alerts (apps 1.8.0): the app downloads each sound into its
 * own files, and hands it to Android as an alarm channel's sound through a FileProvider URI, so it
 * rings like the packaged one — screen off, lock screen, through Do Not Disturb. A channel's sound
 * cannot change after creation, so each sound gets its own channel id (named after the file).
 */
class AlarmSoundsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AlarmSounds"

  private fun dir(): File = File(reactContext.filesDir, "alarm-sounds").apply { mkdirs() }
  private fun authority() = reactContext.packageName + ".alarmsounds"

  /** Download `url` to alarm-sounds/<fileName> (kept if already there). Resolves the file size. */
  @ReactMethod
  fun download(url: String, token: String?, fileName: String, promise: Promise) {
    Thread {
      try {
        val safe = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val target = File(dir(), safe)
        if (target.exists() && target.length() > 0) {
          promise.resolve(target.length().toDouble())
          return@Thread
        }
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 30000
        if (!token.isNullOrEmpty()) conn.setRequestProperty("Authorization", "Bearer $token")
        if (conn.responseCode !in 200..299) {
          promise.reject("HTTP_${conn.responseCode}", "Sound download failed (${conn.responseCode})")
          return@Thread
        }
        val tmp = File(dir(), "$safe.part")
        conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
        if (tmp.length() == 0L || tmp.length() > 3 * 1024 * 1024) {
          tmp.delete()
          promise.reject("BAD_SIZE", "Sound file empty or too large")
          return@Thread
        }
        tmp.renameTo(target)
        promise.resolve(target.length().toDouble())
      } catch (e: Exception) {
        promise.reject("DOWNLOAD", e.message, e)
      }
    }.start()
  }

  /** Create (once) an alarm channel that plays alarm-sounds/<fileName>. */
  @ReactMethod
  fun ensureChannel(channelId: String, name: String, fileName: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(false)
        return
      }
      val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(channelId) != null) {
        promise.resolve(true)
        return
      }
      val file = File(dir(), fileName.replace(Regex("[^A-Za-z0-9._-]"), "_"))
      if (!file.exists()) {
        promise.reject("NO_FILE", "Sound not downloaded")
        return
      }
      val uri: Uri = FileProvider.getUriForFile(reactContext, authority(), file)
      // The system UI plays channel sounds — let it read our file.
      for (pkg in listOf("com.android.systemui", "android")) {
        reactContext.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val ch = NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH)
      ch.setSound(
        uri,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      ch.enableVibration(true)
      ch.vibrationPattern = longArrayOf(300, 400, 300, 400, 300, 400)
      ch.enableLights(true)
      ch.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      ch.setBypassDnd(true)
      nm.createNotificationChannel(ch)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CHANNEL", e.message, e)
    }
  }

  /** Delete alarm channels starting with `prefix` that are not in `keep`; remove sound files not in `keepFiles`. */
  @ReactMethod
  fun cleanup(prefix: String, keep: ReadableArray, keepFiles: ReadableArray, promise: Promise) {
    try {
      val keepIds = (0 until keep.size()).map { keep.getString(it) }.toSet()
      val files = (0 until keepFiles.size()).map { keepFiles.getString(it) }.toSet()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notificationChannels.filter { it.id.startsWith(prefix) && it.id !in keepIds }.forEach { nm.deleteNotificationChannel(it.id) }
      }
      dir().listFiles()?.filter { it.name !in files }?.forEach { it.delete() }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CLEANUP", e.message, e)
    }
  }
}
