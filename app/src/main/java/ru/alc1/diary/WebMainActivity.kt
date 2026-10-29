package ru.alc1.diary

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.IOException

/**
 * «Дневник Amore» как обёртка над сайтом: SPA `h.alc1.ru` в WebView.
 *
 * Фронт (html/css/js) зашит в приложение (`assets/site/`) и раздаётся локально, но под
 * настоящим origin `h.alc1.ru` — см. shouldInterceptRequest ниже. Origin не меняется,
 * поэтому относительные вызовы `/api/...`, кука `hw_sid` и same-origin работают как на
 * сайте; сеть нужна только для API, `usercontent` и страниц `auth.alc1.ru`.
 *
 * Так приложение не зависит от того, что сейчас лежит на сервере, и переживает его падение.
 * Обновление фронта = новая версия APK.
 *
 * Учтено (подробнее — в `Diary/AGENTS.md`, грабли №44–48):
 *  - редирект на `/download.html` для любого Android-UA обойдён подменой UA;
 *  - кука `hw_sid` сбрасывается на диск в onPause/CookieManager.flush();
 *  - «назад» ходит по истории SPA;
 *  - `/dl/diary.apk` отдаётся DownloadManager;
 *  - инсеты статус-бара (targetSdk 37 => принудительный edge-to-edge).
 */
class WebMainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var offline: View
    private lateinit var updater: AutoUpdate
    private lateinit var siteUpdater: SiteUpdater

    private val startUrl = "https://h.alc1.ru/homework.html"

    // Ни слова "Android" в UA — иначе сайт (homework.html:6) уведёт на /download.html.
    private val fakeUa =
        "Mozilla/5.0 (Linux; AmoreDiary 2.0) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0.0.0 Mobile Safari/537.36"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setBackgroundDrawable(ColorDrawable(0xFF082A23.toInt()))

        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#082A23"))
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage: prv, hw_reactions_recent
            databaseEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = fakeUa
            setSupportZoom(false)
            builtInZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        // Всё, что WebView печатает в консоль, складываем в Logs (экран «Логи»).
        // Мост для страницы: долгий тап по «Дневник» в шапке открывает консоль логов.
        web.addJavascriptInterface(object {
            @JavascriptInterface
            fun version(): String {
                val app = versionName()
                val front = siteUpdater.currentVersion()
                return if (front == "builtin") "$app · фронт встроенный" else "$app · фронт $front"
            }

            @JavascriptInterface
            fun openLogs() {
                runOnUiThread {
                    startActivity(Intent(this@WebMainActivity, ConsoleActivity::class.java))
                }
            }
        }, "AmoreApp")

        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                val where = "${m.sourceId()}:${m.lineNumber()}"
                val tag = when (m.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> "err/js"
                    ConsoleMessage.MessageLevel.WARNING -> "warn/js"
                    else -> "js"
                }
                Logs.add(tag, "${m.message()}  ($where)")
                return true
            }
        }
        web.webViewClient = DiaryWebClient()
        web.setDownloadListener(DownloadHandler())

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }

        // Самопроверка версии: раз в минуту смотрит /versions.json и, если вышла новая,
        // предлагает обновиться (скачивает APK и открывает системный установщик).
        // Обновление интерфейса (html/css/js): скачали zip или APK → распаковали →
        // WebView начинает отдавать файлы из filesDir/site вместо assets.
        siteUpdater = SiteUpdater(this) { web.reload() }
        updater = AutoUpdate(this, siteUpdater) { web.reload() }

        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        offline = buildOfflineView()
        root.addView(offline, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        // targetSdk 37 => edge-to-edge принудительный: без инсетов шапка сайта уезжает
        // под статус-бар, а низ — под полосу жестов.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        setContentView(root)
        Logs.add("app", "Версия ${versionName()}, фронт ${siteUpdater.currentVersion()}, запуск WebView")
        web.loadUrl(startUrl)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) { goBackOrFinish() }
        }
    }

    // ─────────────────────────── UI ───────────────────────────

    private fun buildOfflineView(): View {
        val text = TextView(this).apply {
            setText("Нет связи с дневником.\nПроверьте интернет и попробуйте снова.")
            setTextColor(0xFFD4EDDA.toInt())
            textSize = 16f
            gravity = Gravity.CENTER
        }
        val retry = Button(this).apply {
            setText("Повторить")
            setOnClickListener {
                offline.visibility = View.GONE
                web.loadUrl(startUrl)
            }
        }
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            addView(text)
            addView(
                retry,
                LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = 24 }
            )
        }
        return FrameLayout(this).apply {
            setBackgroundColor(0xFF082A23.toInt())
            visibility = View.GONE
            addView(column, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.CENTER))
        }
    }

    // ───────────────────────── helpers ─────────────────────────

    /**
     * Что отдаём из assets: дневник (`h.alc1.ru`), вход (`auth.alc1.ru`) и профиль/настройки
     * (`my.alc1.ru`). Эти страницы зовут API абсолютным адресом `https://h.alc1.ru/api/`,
     * поэтому origin обязан остаться настоящим — иначе сломаются куки и CORS.
     * Всё остальное (`/api/`, `/usercontent/`, `/dl/`) уходит в сеть.
     */
    private fun assetFor(url: Uri): String? {
        val host = url.host ?: return null
        val path = url.path ?: return null
        return when (host) {
            "h.alc1.ru" -> when {
                path == "/" || path == "/homework.html" -> "site/homework.html"
                path.startsWith("/css/") && path.endsWith(".css") -> "site$path"
                path.startsWith("/js/") && path.endsWith(".js") -> "site$path"
                else -> null
            }
            "auth.alc1.ru" -> when (path) {
                "/", "/auth.html" -> "site/auth/auth.html"
                "/auth.css" -> "site/auth/auth.css"
                "/auth.js" -> "site/auth/auth.js"
                else -> null
            }
            "my.alc1.ru" -> when {
                path == "/" || path.startsWith("/@") -> "site/account/profile.html"
                path == "/settings" || path == "/account.html" -> "site/account/account.html"
                path == "/account.css" -> "site/account/account.css"
                path == "/account.js" -> "site/account/account.js"
                path == "/profile.js" -> "site/account/profile.js"
                else -> null
            }
            else -> null
        }
    }

    private fun mimeOf(name: String): String = when (name.substringAfterLast('.', "")) {
        "html" -> "text/html"
        "css" -> "text/css"
        "js" -> "application/javascript"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "woff2" -> "font/woff2"
        else -> "application/octet-stream"
    }

    private fun versionName(): String = try {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
    } catch (e: Exception) {
        "?"
    }

    private fun goBackOrFinish() {
        if (web.canGoBack()) web.goBack() else finish()
    }

    /** /dl/diary.apk WebView сам не качает — отдаём системному загрузчику. */
    private fun handleDownload(url: String, contentDisposition: String?, mimeType: String?) {
        val name = contentDisposition
            ?.substringAfter("filename=", "")
            ?.trim('"', ' ')
            ?.ifBlank { null }
            ?: url.substringAfterLast('/').ifBlank { "diary.apk" }
        try {
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setMimeType(mimeType ?: "application/vnd.android.package-archive")
                .setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                )
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name)
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Logs.add("dl", "скачивание $url → $name")
            Toast.makeText(this, "Скачивание: $name", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            // Нет загрузчика — открываем ссылку браузером.
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }

    // ───────────────────────── «Скин» приложения ─────────────────────────

    /**
     * Правки, которые нужны ТОЛЬКО в приложении, а не на сайте. Поэтому они не в assets
     * (иначе уедут в веб), а вставляются в страницу после загрузки:
     *  1. убрать плашку «уроки» рядом с «Дневник» (`.brand small`);
     *  2. в шапке остаётся только шестерёнка, прижатая к правому краю: ник и роль скрыты,
     *     «пилюля» `.userchip` сделана прозрачной (иначе болтается вокруг одной кнопки);
     *  3. кнопка выхода ⏻ заменена на настройки ⚙; нажатие ничего не открывает.
     *
     * `render()` перерисовывает шапку заново на каждой навигации, поэтому скин навешивается
     * наблюдателем за DOM (с склейкой через requestAnimationFrame — шапка перерисовывается
     * часто из-за живого опроса раз в секунду).
     */
    private val APP_SKIN_JS = """
        (function () {
          if (window.__amoreSkin) return;
          window.__amoreSkin = true;

          var css = ''
            + '.topbar .brand small { display: none !important; }'
            + '.topbar { justify-content: flex-start !important; padding-left: 14px !important; }'
            + '.topbar .brand { position: static !important; order: 0 !important; }'
            + '.topbar .userchip { position: static !important; order: 1 !important;'
            + ' margin-left: auto !important; background: none !important;'
            + ' padding: 0 !important; border: 0 !important; }'
            + '.topbar .userchip > *:not(button) { display: none !important; }'
            + '.topbar .search-container { order: 2 !important; flex: 1 1 100% !important; margin-left: 0 !important; }';
          var st = document.createElement('style');
          st.type = 'text/css';
          st.appendChild(document.createTextNode(css));
          document.head.appendChild(st);

          function ensureVersion() {
            var app = document.getElementById('app');
            if (!app) return;
            var el = document.getElementById('amore-ver');
            if (!el) {
              el = document.createElement('div');
              el.id = 'amore-ver';
              el.setAttribute('data-skin', '1');
              el.style.cssText = 'text-align:center;padding:16px 12px 24px;font-size:12px;'
                + 'letter-spacing:.04em;color:#9db8ac;opacity:.8;font-family:inherit';
              app.appendChild(el);
            }
            var v = '';
            try { if (window.AmoreApp && AmoreApp.version) v = AmoreApp.version(); } catch (e) {}
            var text = v ? ('версия ' + v) : '';
            if (v && el.textContent !== text) el.textContent = text;
          }

          function apply() {
            bindLogs();
            ensureVersion();
            var btn = document.querySelector('.topbar .userchip button');
            if (btn && btn.getAttribute('data-skin') !== '1') {
              btn.setAttribute('data-skin', '1');
              btn.innerHTML = '⚙';
              btn.title = 'Настройки аккаунта';
              btn.removeAttribute('onclick');
              btn.onclick = function (e) {
                if (e) { e.preventDefault(); e.stopPropagation(); }
                return false;   // по нажатию настроек ничего не открываем
              };
            }
          }

          // Долгое нажатие (1,2 с) на «Дневник» в шапке — консоль логов.
          function bindLogs() {
            var br = document.querySelector('.topbar .brand');
            if (!br || br.getAttribute('data-logs') === '1') return;
            br.setAttribute('data-logs', '1');
            var timer = null;
            function fire() {
              timer = setTimeout(function () {
                try { if (window.AmoreApp) window.AmoreApp.openLogs(); } catch (e) {}
              }, 1200);
            }
            function clear() { if (timer) { clearTimeout(timer); timer = null; } }
            br.addEventListener('touchstart', fire, { passive: true });
            br.addEventListener('touchend', clear);
            br.addEventListener('touchmove', clear, { passive: true });
            br.addEventListener('touchcancel', clear);
            br.addEventListener('mousedown', fire);
            br.addEventListener('mouseup', clear);
            br.addEventListener('mouseleave', clear);
          }

          var scheduled = false;
          function schedule() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(function () { scheduled = false; apply(); });
          }
          apply();
          new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
        })();
    """.trimIndent()

    // ───────────────────────── WebView ─────────────────────────

    private inner class DownloadHandler : DownloadListener {
        override fun onDownloadStart(
            url: String?,
            userAgent: String?,
            contentDisposition: String?,
            mimetype: String?,
            contentLength: Long
        ) {
            if (url != null) handleDownload(url, contentDisposition, mimetype)
        }
    }

    private inner class DiaryWebClient : WebViewClient() {

        /**
         * Фронт из assets, но под настоящим origin. Если отдавать через `file://` или
         * `appassets.androidplatform.net`, пришлось бы править `API_BASE` в JS и включать
         * CORS на сервере — а так `/api/...` работает как есть.
         */
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? {
            val local = assetFor(request.url) ?: return null
            val mime = mimeOf(local)
            // 1) скачанный фронт (filesDir/site) — он новее того, что в APK
            if (local.startsWith("site/")) {
                val f = java.io.File(siteUpdater.siteDir(), local.removePrefix("site/"))
                if (f.isFile) {
                    return try {
                        WebResourceResponse(mime, "utf-8", f.inputStream())
                    } catch (e: IOException) {
                        null
                    }
                }
            }
            // 2) то, что зашито в APK
            return try {
                WebResourceResponse(mime, "utf-8", assets.open(local))
            } catch (e: IOException) {
                null                         // нет в assets — пусть грузится с сервера
            }
        }

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val host = request.url.host ?: return true
            // Остаёмся в дневнике, на входе и в профиле/настройках (обе страницы лежат
            // в assets, так что ухода на лендинг Amore не будет). Всё прочее — alc1.ru,
            // внешние ссылки из ДЗ — не открываем.
            return host != "h.alc1.ru" && host != "auth.alc1.ru" && host != "my.alc1.ru"
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            super.onPageStarted(view, url, favicon)
            Logs.add("nav", "→ $url")
        }

        override fun onPageFinished(view: WebView, url: String?) {
            super.onPageFinished(view, url)
            Logs.add("nav", "✓ загружено $url")
            offline.visibility = View.GONE
            view.evaluateJavascript(APP_SKIN_JS, null)   // правки шапки только в приложении
            CookieManager.getInstance().flush()          // сессия переживёт перезапуск
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            Logs.add("err/net", "${error.description} — ${request.url}")
            if (request.isForMainFrame) offline.visibility = View.VISIBLE
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            resp: WebResourceResponse
        ) {
            // 5xx при перезапуске сервиса — не повод закрывать приложение.
            Logs.add("err/http", "${resp.statusCode} — ${request.url}")
            if (request.isForMainFrame && resp.statusCode >= 500) {
                offline.visibility = View.VISIBLE
            }
        }
    }

    // ─────────────────────── lifecycle ───────────────────────

    @Deprecated("для API < 33")
    override fun onBackPressed() = goBackOrFinish()

    override fun onPause() {
        web.onPause()
        updater.stop()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        updater.onResumed()
        updater.start()
        siteUpdater.check()   // манифест фронта, не чаще раза в час
    }

    override fun onDestroy() {
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
}
