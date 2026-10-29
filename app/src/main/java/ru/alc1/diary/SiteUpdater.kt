package ru.alc1.diary

import android.app.Activity
import android.content.SharedPreferences
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream

/**
 * Обновление ИНТЕРФЕЙСА без переустановки APK.
 *
 * Логика:
 *  1. читаем `https://h.alc1.ru/front.json` — манифест фронта (version/zip/size/sha256);
 *  2. версия новее нашей → панель «Доступно обновление интерфейса»;
 *  3. по нажатию качаем zip во внутреннюю папку `filesDir/front/`;
 *  4. распаковываем в `filesDir/site.tmp`, затем подменяем `filesDir/site`;
 *  5. WebView перезагружается и `shouldInterceptRequest` отдаёт файлы уже из `filesDir/site`,
 *     а если их нет — из assets.
 *
 * Так шапка/скрипты/стили обновляются за секунды, без установщика и без Play Protect.
 */
class SiteUpdater(private val act: Activity, private val onApplied: () -> Unit) {

    companion object {
        private const val MANIFEST_URL = "https://h.alc1.ru/front.json"
        private const val DL_BASE = "https://alc1.ru/dl/"
        private const val PREFS = "site_update"
        private const val KEY_VERSION = "front_version"
        private const val CHECK_MS = 60 * 60 * 1000L      // раз в час хватает
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val prefs: SharedPreferences = act.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
    private var noticed = false
    private var lastCheck = 0L
    private var busy = false

    /** Папка с актуальным фронтом (может отсутствовать — тогда работаем из assets). */
    fun siteDir(): File = File(act.filesDir, "site")

    /** Куда кладём скачанные архивы. */
    private fun frontDir(): File = File(act.filesDir, "front").apply { mkdirs() }

    fun currentVersion(): String = prefs.getString(KEY_VERSION, null) ?: "builtin"

    private fun installedVersion(): String = try {
        @Suppress("DEPRECATION")
        act.packageManager.getPackageInfo(act.packageName, 0).versionName ?: "?"
    } catch (e: Exception) {
        "?"
    }

    /** Проверка не чаще раза в час (и по кнопке из панели). */
    fun check(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (busy) return
        if (!force && now - lastCheck < CHECK_MS) return
        lastCheck = now
        busy = true
        Thread {
            var version: String? = null
            var zipName: String? = null
            var size = -1L
            var sha = ""
            try {
                val body = client.newCall(
                    Request.Builder().url(MANIFEST_URL).header("Cache-Control", "no-cache").build()
                ).execute().use { if (it.isSuccessful) it.body?.string() else null }
                if (body != null) {
                    val j = JSONObject(body)
                    version = j.optString("version").ifBlank { null }
                    zipName = j.optString("zip").ifBlank { null }
                    size = j.optLong("size", -1L)
                    sha = j.optString("sha256")
                }
            } catch (e: Exception) {
                Logs.add("warn/front", "манифест фронта недоступен: ${e.javaClass.simpleName}")
            }
            busy = false
            if (version == null || zipName == null) return@Thread
            if (version == currentVersion()) {
                Logs.add("front", "фронт актуален: $version")
                return@Thread
            }
            Logs.add("front", "доступен фронт $version (у нас ${currentVersion()})")
            act.runOnUiThread { ask(version, zipName, size, sha) }
        }.start()
    }

    private fun ask(version: String, zipName: String, size: Long, sha: String) {
        if (noticed) return
        noticed = true
        val p = UpdatePanel(
            act, version, size,
            title = "ОБНОВЛЕНИЕ ИНТЕРФЕЙСА",
            headline = "Интерфейс $version",
            kind = "interface"
        )
        p.show(
            onUpdate = { p.startDownload(); downloadAndApply(version, zipName, size, sha, p) },
            onLater = { noticed = false },
            onSkip = { noticed = false }
        )
    }

    // ───────────────────────── скачивание и распаковка ─────────────────────────

    private fun downloadAndApply(version: String, zipName: String, size: Long, sha: String, panel: UpdatePanel) {
        Thread {
            val zip = File(frontDir(), zipName)
            try {
                client.newCall(Request.Builder().url(DL_BASE + zipName).build()).execute().use { resp ->
                    if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code}")
                    val total = resp.body?.contentLength() ?: -1L
                    resp.body?.byteStream()?.use { input ->
                        zip.outputStream().use { out ->
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
                if (size > 0 && zip.length() != size) throw IllegalStateException("размер не совпал")
                if (sha.isNotEmpty() && !sha.equals(sha256(zip), true)) throw IllegalStateException("sha256 не совпал")

                act.runOnUiThread { panel.progress(-1) }
                val applied = unpack(zip)
                if (!applied) throw IllegalStateException("не удалось распаковать")

                prefs.edit().putString(KEY_VERSION, version).apply()
                Logs.add("front", "фронт $version установлен → перезагрузка")
                Logs.add("app", "Версия ${installedVersion()}, фронт $version")

                act.runOnUiThread {
                    panel.finishAndInstall()
                    onApplied()
                }
            } catch (e: Exception) {
                Logs.add("err/front", "обновление фронта: ${e.message}")
                act.runOnUiThread { panel.fail("Не удалось: ${e.message ?: "ошибка"}") }
            }
        }.start()
    }

    /** Распаковка «на лету»: сначала site.tmp, потом атомарная подмена site. */
    private fun unpack(zip: File): Boolean {
        return try {
            val tmp = File(act.filesDir, "site.tmp")
            tmp.deleteRecursively()
            tmp.mkdirs()
            ZipInputStream(zip.inputStream().buffered()).use { zin ->
                var entry = zin.nextEntry
                while (entry != null) {
                    val name = entry.name
                    if (!name.endsWith("/")) {
                        val target = File(tmp, name)
                        // защита от «../» в архиве
                        if (!target.canonicalPath.startsWith(tmp.canonicalPath)) {
                            throw IllegalStateException("небезопасный путь в архиве: $name")
                        }
                        target.parentFile?.mkdirs()
                        target.outputStream().use { out -> zin.copyTo(out) }
                    }
                    zin.closeEntry()
                    entry = zin.nextEntry
                }
            }
            val live = siteDir()
            val old = File(act.filesDir, "site.old")
            old.deleteRecursively()
            if (live.exists()) live.renameTo(old)
            if (!tmp.renameTo(live)) {
                old.renameTo(live)          // откат
                throw IllegalStateException("не удалось подменить папку фронта")
            }
            old.deleteRecursively()
            zip.delete()
            true
        } catch (e: Exception) {
            Logs.add("err/front", "распаковка: ${e.message}")
            false
        }
    }

    /**
     * Применить фронт ИЗ APK: APK — это zip, внутри `assets/site/...`. Берём только эти
     * записи и подменяем ими `filesDir/site`. Так любое обновление (критическое,
     * желательное) приезжает так же, как интерфейсное — без установщика.
     */
    fun applyFromApk(apk: java.io.File, version: String): Boolean {
        val tmp = File(act.filesDir, "site.tmp")
        tmp.deleteRecursively()
        tmp.mkdirs()
        return try {
            var count = 0
            java.util.zip.ZipFile(apk).use { zf ->
                for (entry in zf.entries()) {
                    val name = entry.name
                    if (!name.startsWith("assets/site/") || name.endsWith("/")) continue
                    val rel = name.removePrefix("assets/site/")
                    val target = File(tmp, rel)
                    if (!target.canonicalPath.startsWith(tmp.canonicalPath)) continue
                    target.parentFile?.mkdirs()
                    zf.getInputStream(entry).use { input ->
                        target.outputStream().use { out -> input.copyTo(out) }
                    }
                    count++
                }
            }
            Logs.add("front", "из APK извлечено файлов: $count")
            if (count == 0) throw IllegalStateException("в APK нет assets/site")

            val live = siteDir()
            val old = File(act.filesDir, "site.old")
            old.deleteRecursively()
            if (live.exists()) live.renameTo(old)
            if (!tmp.renameTo(live)) {
                old.renameTo(live)
                throw IllegalStateException("не удалось подменить папку фронта")
            }
            old.deleteRecursively()
            prefs.edit().putString(KEY_VERSION, version).apply()
            Logs.add("front", "фронт $version применён из APK")
            true
        } catch (e: Exception) {
            Logs.add("err/front", "applyFromApk: ${e.message}")
            false
        }
    }

    private fun sha256(file: File): String = try {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n <= 0) break
                md.update(buf, 0, n)
            }
        }
        md.digest().joinToString("") { "%02x".format(it) }
    } catch (e: Exception) {
        ""
    }

    /** Полный сброс скачанного фронта (вернуться к тому, что внутри APK). */
    fun resetToBuiltin() {
        siteDir().deleteRecursively()
        prefs.edit().remove(KEY_VERSION).apply()
        Logs.add("front", "сброс на встроенный фронт")
        onApplied()
    }
}
