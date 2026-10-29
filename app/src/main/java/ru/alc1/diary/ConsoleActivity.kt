package ru.alc1.diary

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.method.ScrollingMovementMethod
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * «Консоль» — экран с логами вместо старого нативного интерфейса.
 *
 * Старый Compose-клиент (вход, лента, карточки) удалён: единственный рабочий интерфейс —
 * WebMainActivity с сайтом в WebView. А это окно нужно, чтобы на самом телефоне видеть,
 * что происходит: консоль JS, ошибки сети, проверки обновления.
 */
class ConsoleActivity : Activity() {

    private lateinit var out: TextView
    private lateinit var scroll: ScrollView

    private val listener: (List<String>) -> Unit = { lines ->
        runOnUiThread {
            out.text = lines.joinToString("\n")
            scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = 0xFF082A23.toInt()
        window.navigationBarColor = 0xFF082A23.toInt()

        out = TextView(this).apply {
            setTextColor(0xFFD4EDDA.toInt())
            textSize = 11f
            typeface = android.graphics.Typeface.MONOSPACE
            setPadding(24, 16, 24, 16)
            movementMethod = ScrollingMovementMethod()
            setTextIsSelectable(true)
        }
        scroll = ScrollView(this).apply { addView(out) }

        val clear = Button(this).apply {
            text = "Очистить"
            setOnClickListener { Logs.clear(); toast("Логи очищены") }
        }
        val copy = Button(this).apply {
            text = "Копировать"
            setOnClickListener {
                val clip = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clip.setPrimaryClip(ClipData.newPlainText("logs", Logs.snapshot().joinToString("\n")))
                toast("Скопировано")
            }
        }
        val open = Button(this).apply {
            text = "Открыть дневник"
            setOnClickListener {
                startActivity(Intent(this@ConsoleActivity, WebMainActivity::class.java))
            }
        }
        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(12, 10, 12, 10)
            setBackgroundColor(0xFF0F3F35.toInt())
            listOf(clear, copy, open).forEach { addView(it, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)) }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF082A23.toInt())
            addView(scroll, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
            addView(buttons, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }
        setContentView(root)

        Logs.subscribe(listener)
        if (Logs.snapshot().isEmpty()) {
            Logs.add("console", "Логов пока нет. Откройте дневник — сюда попадёт консоль JS и сеть.")
        }
    }

    override fun onDestroy() {
        Logs.unsubscribe(listener)
        super.onDestroy()
    }

    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_SHORT).show()
}
