package ru.alc1.diary

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Проверка обновлений без самоустановки.
 *
 * Приложение больше НЕ ставит APK само (из-за этого Play Protect считал его
 * «установщиком приложений» и блокировал). Теперь: раз в минуту смотрим
 * `h.alc1.ru/versions.json`, сравниваем версию и, если вышла новая, показываем
 * панель «Доступно обновление X» с кнопкой, которая открывает страницу загрузки
 * в браузере. Пользователь скачивает и ставит APK обычным способом.
 *
 * В манифесте поэтому нет `REQUEST_INSTALL_PACKAGES` и FileProvider.
 */
class AutoUpdate(
    private val act: Activity,
    private val sites: SiteUpdater,
    private val onFrontApplied: () -> Unit
) {

    companion object {
        private const val MANIFEST = "https://h.alc1.ru/versions.json"
        private const val DL_BASE = "https://alc1.ru/dl/"
        private const val DOWNLOAD_PAGE = "https://h.alc1.ru/download.html"
        private const val PREFS = "autoupdate"
        private const val KEY_SKIP = "skip_version"
        private const val KEY_SEEN = "seen_version"
        private const val TICK_MS = 60_000L
    }

    private val ui = Handler(Looper.getMainLooper())
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private var busy = false
    private var panel: UpdatePanel? = null

    private val tick = object : Runnable {
        override fun run() {
            check()
            ui.postDelayed(this, TICK_MS)
        }
    }

    fun start() {
        ui.removeCallbacks(tick)
        ui.post(tick)
    }

    fun stop() = ui.removeCallbacks(tick)

    /** Вызывается из onResume: ничего не продолжаем, но проверяем сразу. */
    fun onResumed() {
        check()
    }

    // ───────────────────────── проверка ─────────────────────────

    private fun check() {
        if (busy) return
        busy = true
        Thread {
            var latest: String? = null
            var size = -1L
            var level = "recommended"
            try {
                val body = client.newCall(
                    Request.Builder().url(MANIFEST).header("Cache-Control", "no-cache").build()
                ).execute().use { r ->
                    if (!r.isSuccessful) null else r.body?.string()
                }
                if (body != null) {
                    val json = JSONObject(body)
                    latest = json.optString("latest").ifBlank { null }
                    level = json.optString("latest_level", "recommended").ifBlank { "recommended" }
                    val arr = json.optJSONArray("files")
                    if (arr != null && latest != null) {
                        for (i in 0 until arr.length()) {
                            val o = arr.getJSONObject(i)
                            if (o.optString("version") == latest) size = o.optLong("size", -1L)
                        }
                    }
                }
            } catch (e: Exception) {
                Logs.add("warn/update", "нет манифеста: ${e.javaClass.simpleName}")
            }
            busy = false
            if (latest == null) return@Thread

            val now = installedVersion()
            if (!isNewer(latest, now)) return@Thread
            if (skipped(latest)) {
                Logs.add("update", "$latest пропущена")
                return@Thread
            }
            Logs.add("update", "доступна $latest ($level, у нас $now)")
            ui.post { ask(latest, size, level) }
        }.start()
    }

    private fun installedVersion(): String = try {
        @Suppress("DEPRECATION")
        act.packageManager.getPackageInfo(act.packageName, 0).versionName ?: "0"
    } catch (e: Exception) {
        "0"
    }

    private fun parts(v: String) = v.split('.').map { it.trim().toIntOrNull() ?: 0 }

    private fun isNewer(remote: String, local: String): Boolean {
        val a = parts(remote)
        val b = parts(local)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private fun skipped(v: String) = act
        .getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
        .getString(KEY_SKIP, null) == v

    // ───────────────────────── панель ─────────────────────────

    private fun ask(version: String, size: Long, level: String) {
        if (act.isFinishing || act.isDestroyed) return
        val open = panel
        if (open != null && open.showing) return
        val title = when (level) {
            "critical" -> "КРИТИЧЕСКОЕ ОБНОВЛЕНИЕ"
            else -> "ЖЕЛАТЕЛЬНОЕ ОБНОВЛЕНИЕ"
        }
        val p = UpdatePanel(act, version, size, title = title, kind = level)
        panel = p
        p.show(
            onUpdate = {
                act.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .edit().putString(KEY_SKIP, version).putString(KEY_SEEN, version).apply()
                p.startDownload()
                downloadAndApply(version, size, p)
            },
            onLater = { },
            onSkip = {
                act.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .edit().putString(KEY_SKIP, version).apply()
            }
        )
    }

    /**
     * Скачиваем APK целиком, но применяем из него ТОЛЬКО интерфейс:
     * распаковываем `assets/site/...` в `filesDir/site` и перезагружаем WebView.
     * Так любое обновление приходит так же, как интерфейсное — без установщика.
     * APK остаётся в `filesDir/front/` — если нужны нативные изменения, его можно
     * поставить вручную (кнопка «Открыть страницу загрузки» в панели «Позже»).
     */
    private fun downloadAndApply(version: String, size: Long, panel: UpdatePanel) {
        Thread {
            try {
                val apkName = "AmoreDiary-$version.apk"
                val apk = java.io.File(act.filesDir, "front/$apkName")
                apk.parentFile?.mkdirs()
                client.newCall(Request.Builder().url(DL_BASE + apkName).build()).execute().use { resp ->
                    if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code}")
                    val total = resp.body?.contentLength() ?: size
                    resp.body?.byteStream()?.use { input ->
                        apk.outputStream().use { out ->
                            val buf = ByteArray(64 * 1024)
                            var done = 0L
                            var last = -1
                            while (true) {
                                val n = input.read(buf)
                                if (n <= 0) break
                                out.write(buf, 0, n)
                                done += n
                                val pct = if (total > 0) ((done * 100) / total).toInt() else -1
                                if (pct != last) {
                                    last = pct
                                    act.runOnUiThread { panel.progress(pct, done) }
                                }
                            }
                        }
                    }
                }
                if (size > 0 && apk.length() != size) throw IllegalStateException("размер не совпал")

                act.runOnUiThread { panel.progress(-1) }
                if (!sites.applyFromApk(apk, version)) throw IllegalStateException("не удалось распаковать APK")

                Logs.add("update", "$version: интерфейс обновлён из APK")
                act.runOnUiThread {
                    panel.finishAndInstall()
                    onFrontApplied()
                }
            } catch (e: Exception) {
                Logs.add("err/update", "обновление: ${e.message}")
                act.runOnUiThread { panel.fail("Не удалось: ${e.message ?: "ошибка"}") }
            }
        }.start()
    }

    /** Запасной путь: открыть страницу загрузки в браузере. */
    private fun openDownload() {
        try {
            act.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(DOWNLOAD_PAGE)))
        } catch (e: Exception) {
            Logs.add("err/update", "не смог открыть браузер: ${e.message}")
            AlertDialog.Builder(act)
                .setTitle("Обновление")
                .setMessage("Откройте в браузере: $DOWNLOAD_PAGE")
                .setPositiveButton("Ок") { _, _ -> }
                .show()
        }
    }
}
