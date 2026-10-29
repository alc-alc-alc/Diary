package ru.alc1.diary

import android.os.Handler
import android.os.Looper
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/**
 * Кольцевой буфер логов приложения — то, что показывает экран «Консоль».
 *
 * Зачем: на телефоне нет logcat, а разбираться с WebView/обновлениями приходится именно там.
 * Сюда пишут: консоль JS из WebView, ошибки загрузки страниц, скачивания, автообновление.
 */
object Logs {

    private const val MAX = 800
    private val lines = ArrayDeque<String>()
    private val fmt = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
    private val ui = Handler(Looper.getMainLooper())
    private val listeners = mutableListOf<(List<String>) -> Unit>()

    fun add(tag: String, message: String) {
        val clean = message.replace("\n", " ⏎ ")
        val line = "${fmt.format(Date())} [$tag] $clean"
        // Дублируем в logcat: удобно, когда телефон подключён к adb.
        when {
            tag.startsWith("err") -> android.util.Log.e("Amore", "$tag: $clean")
            tag.startsWith("warn") -> android.util.Log.w("Amore", "$tag: $clean")
            else -> android.util.Log.i("Amore", "$tag: $clean")
        }
        synchronized(lines) {
            lines.addLast(line)
            while (lines.size > MAX) lines.removeFirst()
        }
        emit()
    }

    fun snapshot(): List<String> = synchronized(lines) { lines.toList() }

    fun clear() {
        synchronized(lines) { lines.clear() }
        emit()
    }

    fun subscribe(l: (List<String>) -> Unit) {
        listeners += l
        l(snapshot())
    }

    fun unsubscribe(l: (List<String>) -> Unit) {
        listeners -= l
    }

    private fun emit() {
        val snap = snapshot()
        ui.post { listeners.toList().forEach { it(snap) } }
    }
}
