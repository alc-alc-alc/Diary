package ru.alc1.diary

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.Window
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Панель обновления — своя, вместо системного AlertDialog.
 *
 * Тёмно-зелёная карточка в стиле дневника: заголовок, номер версии, размер файла,
 * кнопки «Обновить» / «Позже», ссылка «Пропустить версию». После нажатия «Обновить»
 * панель не закрывается, а превращается в прогресс — так видно, что происходит,
 * и она больше не всплывает заново.
 */
class UpdatePanel(
    private val act: Activity,
    private val version: String,
    private val sizeBytes: Long,
    private val title: String = "ОБНОВЛЕНИЕ",
    private val headline: String = "Дневник $version",
    private val kind: String = "recommended"      // critical | recommended | interface
) {

    private val dlg = Dialog(act)
    private lateinit var status: TextView
    private lateinit var bar: ProgressBar
    private lateinit var update: Button
    private lateinit var later: Button
    private lateinit var skip: TextView
    var showing = false
        private set

    private val bgCard = Color.parseColor("#0F3F35")
    private val bgField = Color.parseColor("#134536")
    private val ink = Color.parseColor("#EEF6EF")
    private val dim = Color.parseColor("#9DB8AC")
    private val sun = Color.parseColor("#FFD166")
    private val sunDeep = Color.parseColor("#B97E00")
    private val red = Color.parseColor("#FF6B4A")
    private val redDeep = Color.parseColor("#A8341C")
    private val mint = Color.parseColor("#7BE0B0")

    private val accent: Int = when (kind) {
        "critical" -> red
        "interface" -> mint
        else -> sun
    }
    private val accentDeep: Int = when (kind) {
        "critical" -> redDeep
        "interface" -> Color.parseColor("#1E8F6B")
        else -> sunDeep
    }

    fun show(onUpdate: () -> Unit, onLater: () -> Unit, onSkip: () -> Unit) {
        val root = LinearLayout(act).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(22), dp(24), dp(18))
            background = rounded(bgCard, 26)
        }

        root.addView(TextView(act).apply {
            text = title
            setTextColor(accent)
            textSize = 11f
            letterSpacing = 0.18f
            typeface = Typeface.DEFAULT_BOLD
        })

        root.addView(TextView(act).apply {
            text = headline
            setTextColor(accent)
            textSize = 24f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(6), 0, 0)
        })

        status = TextView(act).apply {
            text = "Откроется страница загрузки · ${sizeText(sizeBytes)}"
            setTextColor(ink)
            textSize = 14f
            setPadding(0, dp(8), 0, 0)
        }
        root.addView(status)

        bar = ProgressBar(act, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            visibility = View.GONE
            progressTintList = android.content.res.ColorStateList.valueOf(sun)
            setPadding(0, dp(14), 0, 0)
        }
        root.addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

        val row = LinearLayout(act).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(0, dp(20), 0, 0)
        }
        later = Button(act).apply {
            text = "Позже"
            isAllCaps = false
            textSize = 15f
            setTextColor(ink)
            background = rounded(Color.parseColor("#1B5747"), 14)
            setOnClickListener { dlg.dismiss(); onLater() }
        }
        update = Button(act).apply {
            text = "Скачать"
            isAllCaps = false
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#2A1D00"))
            background = rounded(accent, 14)
            if (kind == "critical") setTextColor(Color.parseColor("#2A0A00"))
            setOnClickListener { onUpdate() }
        }
        row.addView(later, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { rightMargin = dp(10) })
        row.addView(update, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        root.addView(row)

        skip = TextView(act).apply {
            text = "Пропустить эту версию"
            setTextColor(dim)
            textSize = 12f
            gravity = Gravity.CENTER
            setPadding(0, dp(14), 0, 0)
            setOnClickListener { dlg.dismiss(); onSkip() }
        }
        if (kind != "critical") root.addView(skip)

        dlg.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dlg.setContentView(root)
        dlg.setCanceledOnTouchOutside(false)
        dlg.window?.apply {
            setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
            val w = (act.resources.displayMetrics.widthPixels * 0.9f).toInt()
            setLayout(minOf(w, dp(380)), WRAP_CONTENT)
        }
        showing = true
        dlg.setOnDismissListener { showing = false }
        dlg.show()
    }

    /** Режим скачивания: кнопки больше не нужны, показываем прогресс. */
    fun startDownload() {
        if (!showing) return
        update.visibility = View.GONE
        later.visibility = View.GONE
        skip.visibility = View.GONE
        bar.visibility = View.VISIBLE
        bar.progress = 0
        status.text = "Скачивание… 0 %"
    }

    fun progress(pct: Int, downloaded: Long = 0) {
        if (!showing) return
        bar.visibility = View.VISIBLE
        if (pct >= 0) {
            bar.progress = pct
            status.text = "Скачивание… $pct %"
        } else {
            status.text = "Скачивание… ${downloaded / 1024 / 1024} МБ"
        }
    }

    fun finishAndInstall() {
        showing = false
        dlg.dismiss()
    }

    fun fail(message: String) {
        if (!showing) return
        bar.visibility = View.GONE
        status.text = message
        update.visibility = View.VISIBLE
        update.text = "Повторить"
        later.visibility = View.VISIBLE
    }

    private fun dp(v: Int) = (v * act.resources.displayMetrics.density).toInt()

    private fun rounded(color: Int, radiusDp: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radiusDp).toFloat()
        if (color == accent) setStroke(dp(1), accentDeep)
    }

    private fun sizeText(bytes: Long): String = when {
        bytes <= 0 -> "неизвестный размер"
        bytes < 1024 * 1024 -> "${bytes / 1024} КБ"
        else -> String.format("%.1f МБ", bytes / 1048576.0)
    }
}
