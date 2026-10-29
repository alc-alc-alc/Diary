# AGENTS.md — Android-приложение «Дневник Amore»

> Отдельный проект: нативный клиент к API сайта. **Не** часть репозитория `alc1.ru`
> (иначе `sync.sh` зальёт его на сервер). Общее про сервер, API и шифрование — в
> `../alc1.ru/AGENTS.md` (§1–§12); здесь только приложение.
>
> Вынесено из `alc1.ru/AGENTS.md` 27.10: там файл упёрся в лимит инструкций (65 536 Б)
> и раздел про приложение начал обрезаться при загрузке.

## 1. Что это

Обёртка над сайтом: WebView + автообновление (Compose-клиент удалён). Пакет `ru.alc1.diary`. Отдельный проект: `/mnt/usr/alc/Amore/Diary`, **вне репозитория
сайта** (иначе `sync.sh` зальёт его на сервер). Сервер менять не нужно — те же эндпоинты.

## 2. Основа
- Kotlin + Jetpack Compose (шаблон Empty Activity), пакет `ru.alc1.diary`, minSdk 26, AGP 9.x,
  Kotlin 2.2.x (версия берётся из `gradle/libs.versions.toml`).
- Зависимости: OkHttp (+ Core для FileProvider). Compose-библиотеки в `build.gradle` остались,
  но UI на Compose больше нет — R8 их вырезает.

### Что уже сделано
| Когда | Что |
|---|---|
| 27.10 | `WebMainActivity` — сайт `h.alc1.ru` в WebView: свой UA, CookieManager + flush, история по «назад», DownloadManager для `/dl/diary.apk`, заглушка «нет сети», инсеты |
| 27.10 | Шапка **только в приложении** (инъекция в WebView, сайт не тронут): убрана плашка «уроки», ник и роль скрыты, справа по центру остаётся только ⚙ (нажатие ничего не открывает); уходы по ссылкам заблокированы |
| 27.10 | В assets добавлены исходники **входа** (`site/auth/`) и **профиля/настроек** (`site/account/`), раздаются локально под своими хостами |
| 27.10 | Вход: убраны реквизиты, метка «alc1.ru», бегущая полоса; подвал вернулся, поле по центру, при регистрации скрыт заголовок; на `≤760px` выключены только анимации blur-шаров и лишние `backdrop-filter` (цвета и стекло на месте) |
| 27.10 | Обновления: два канала (`front.json` + zip и `versions.json` + APK), три типа (`critical`/`recommended`/`interface`), но **один путь** — приложение само качает файл, распаковывает в `filesDir/site` и перезагружает WebView. `REQUEST_INSTALL_PACKAGES` убран. Версия `0.3.9.311` |
| 27.10 | Нативный Compose-клиент удалён (`Api.kt`, `Crypto.kt`, `SessionStore.kt`, `data/`, `ui/`, `MainActivity`) → APK 2.38 МБ → 0.61 МБ. Единственная иконка открывает **дневник**, консоль логов — долгий тап по «Дневник» в шапке. Версия `0.3.9` |

### Правила
- Вход через `sso_login` + `sso_exchange` (как на сайте): ответ `session.prv` — приватный RSA-ключ в JWK.
- RSA-OAEP на сервере и в браузере с **SHA-1** (и для хеша, и для MGF1). В Android явно задавать
  `OAEPParameterSpec("SHA-1", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT)`,
  иначе MGF1 по умолчанию будет SHA-1 только на части версий и расшифровка не сойдётся.
- Ключ группы и текст ДЗ: RSA разворачивает 32-байтный AES-ключ (hex), дальше AES-GCM (iv 12 байт, тег 128 бит),
  `iv`/`ct` в base64. Приватный JWK собирать в `RSAPrivateCrtKeySpec` из `n,e,d,p,q,dp,dq,qi` (base64url).
- Cookie и `prv` — в `EncryptedSharedPreferences` (см. грабли 12–13).
- Ошибки сети и 401 различать: разлогин только при явном 401 (см. §8 п.6).
- PoW: сервер требует возраст челленджа ≥ 1 с (`POW_MIN_AGE`), не слать мгновенно.

### Грабли

> Compose-грабли из старого нативного клиента удалены вместе с ним.

1. `kotlin.serialization` — через каталог версий (`alias(libs.plugins...)`, `version.ref = "kotlin"`);
   строка `kotlin(...) version ...` вне `plugins` ломает синхронизацию Gradle.
2. Имя темы на кириллице (`ДневникAmoreTheme`) ломало ссылки → только латиница (`AmoreDiaryTheme`).
3. **Cookie.** Не `cookie.toString()`/`Cookie.parse()` (теряются при `HttpOnly`/`SameSite`):
    хранить `cookie.value`, собирать `Cookie.Builder().name("hw_sid").value(v).domain(host).path("/")`.
4. Импорты — строго в начале файла; `.jsonObject` и др. — **расширения**, нужен
    `import kotlinx.serialization.json.jsonObject`.
5. **Release/R8.** Нужен `proguard-rules.pro` (даже пустой, иначе «does not exist»),
    `-dontwarn com.google.errorprone.annotations.**` (Tink), `-keep` для `kotlinx.serialization`.
6. Файлы шрифтов в `res/font` — только `a-z0-9_` (`Caveat-Bold.ttf` → `caveat_bold.ttf`).
7. **`lid`, а не `id`** — главная причина «Нет доступа к уроку». Все обработчики `lessons.py`
    читают `lid = strf(body,'lid',40)` (`edit`:74, `del`:95, `done`:113, `react`:156). Прислать
    `id` → `lid` пустой → JOIN «урок+членство» пусто → 403 «Нет доступа к уроку», хотя дело
    только в имени поля. Тип значения не важен (`strf` делает `str(v)`). Сайт шлёт `{lid}`.
8. **`Origin`/`Referer`.** Сервер режет POST без них (403 «Нет доступа») — в OkHttp добавлять
    `Interceptor` с `Origin: https://h.alc1.ru`.
9. **Сборка релиза из-под агента ВОЗМОЖНА** (обновлено 27.10). `~/.gradle` недоступен на запись,
    но кэш можно один раз скопировать в воркспейс и указать его:
    ```bash
    cp -a ~/.gradle/caches ~/.gradle/wrapper /mnt/usr/alc/Amore/.gradle-home/   # один раз, 2.3 ГБ
    cd Diary && GRADLE_USER_HOME=/mnt/usr/alc/Amore/.gradle-home \
      ./gradlew --offline -q :app:assembleRelease
    ```
    Хардлинки не работают (`Invalid cross-device link` — домашняя папка на другой ФС).
    Без `GRADLE_USER_HOME` падает: `...zip.lck: Read-only file system`, а из-за `| tail`
    код выхода 0 — похоже на успех. Выход: `app/build/outputs/apk/release/app-release-unsigned.apk`
    → подписать `scripts/publish-apk.sh`.
10. **Не жать Play слепым кликом:** фокус в Hyprland по наведению мыши, рабочая область могла
    смениться. Перед кликом `hyprctl activewindow -j | grep class`.
    Плюс: после смены версии **Play не всегда пересобирает** — на эмуляторе остаётся старый
    `versionName` (так и было 27.10: релиз уже `0.3.6.121`, а на эмуляторе висела debug-сборка
    `1.3`). Надёжнее собрать и поставить руками:
    ```bash
    GRADLE_USER_HOME=/mnt/usr/alc/Amore/.gradle-home ./gradlew --offline -q :app:assembleDebug
    adb install -r app/build/outputs/apk/debug/app-debug.apk
    adb shell dumpsys package ru.alc1.diary | grep -m2 -E "versionName|versionCode"
    ```
11. **Не выдумывать «красивее», чем на сайте:** в `board.css` `.btn.sun` — плоская `--sun` +
    подошва `0 5px 0 #b97e00`; градиент только у `.daytab.on`/`.sched-auto`. Копировать
    значения CSS (`radius 8px`, `padding 12px 18px`, `font 700 14px`), а не добавлять эффекты.
12. **Иконка одна** — `WebMainActivity` (дневник). `ConsoleActivity` намеренно без
    intent-filter и с `exported=false`: если вернуть ей LAUNCHER, на телефоне появятся две
    иконки «Дневник» и «Логи». Открывается долгим тапом по бренду.
13. **Сайт уводит WebView на `/download.html`** (`homework.html:6` режет любой Android-UA).
    Обход: UA без слова «Android» (`… AmoreDiary 2.0 … Mobile Safari`), вёрстка от UA не зависит.
    Кука `force_web` не спасает (host-only для `alc1.ru`, в `homework.html` не проверяется).
14. **Edge-to-edge при targetSdk 37** принудительный: WebView рисовался под статус-баром →
    `ViewCompat.setOnApplyWindowInsetsListener` на корне + `systemBars() or ime()` в паддинг.
15. **`h.alc1.ru/` — гостевая промо-страница**, а не SPA (в репозитории только `homework.html`).
    «Пусто и просит войти» = нет куки `hw_sid`, это не баг WebView.
16. **Фронт в assets** (`app/src/main/assets/site/`, ~316 КБ) — три набора:
    `homework.html` + `css/` + `js/` (дневник), `auth/` (вход), `account/` (профиль + настройки).
    Раздаются через `shouldInterceptRequest` **под настоящими origin** (`h./auth./my.alc1.ru`) —
    иначе сломаются кука и same-origin; API эти страницы зовут абсолютно
    (`https://h.alc1.ru/api/`, `auth.js:1`, `account.js:1`), поэтому им всё равно, откуда отданы.
    Маппинг — `WebMainActivity.assetFor()`. `file://`/`WebViewAssetLoader` не годятся: пришлось бы
    менять `API_BASE` в JS и открывать CORS. Обновление после правок сайта:
    ```bash
    cd /mnt/usr/alc/Amore
    cp alc1.ru/homework/homework.html Diary/app/src/main/assets/site/
    cp -r alc1.ru/homework/css alc1.ru/homework/js Diary/app/src/main/assets/site/
    cp alc1.ru/auth/*    Diary/app/src/main/assets/site/auth/
    cp alc1.ru/account/* Diary/app/src/main/assets/site/account/
    ```
    Сверка с сервером: `cd alc1.ru/homework && for f in js/*.js css/*.css homework.html; do
    [ "$(md5sum <"$f")" = "$(curl -sS https://h.alc1.ru/$f | md5sum)" ] || echo "DIFF $f"; done`
17. **assets сильнее сети, но и опаснее:** без интернета приложение открывается (падает только
    API), зато правки на сервере не видны до новой версии APK → версию поднимать каждый раз.
18. **Kotlin `Unresolved reference` на члены своего же класса** (было с `download`/`MATCH`/`WRAP`
    при синтаксически целом файле). Чистка `app/build` не помогла — помогла **полная перезапись
    файла**. Не искать логику, переписать целиком.

### Оффлайн

Фронт в assets ведёт себя как сайт: кеш ответов в `localStorage`, плашка «Нет связи»,
`resync()` — подробности и грабли в `alc1.ru/AGENTS.md` §7 «Оффлайн-кеш». В приложении
дополнительно: плашка живёт строкой под `.topbar` (`tb.after`), а не внутри шапки;
`-webkit-tap-highlight-color: transparent` убирает синюю вспышку по кнопкам.
Тест: `adb shell svc wifi disable; svc data disable` → перезапуск → включить обратно.

### Правило: сайт не трогаем

**Всё, что придумано для приложения, живёт только в `APP_SKIN_JS`** (и в Kotlin), а не в
`alc1.ru/homework/*`. 29.10 фронт дневника откатили к коммиту `INITIAL: WITH STARTED V0.3.6`
(`git checkout -- homework/js/app.js homework/js/render.js homework/css/app.css homework/homework.html`),
потому что в него уехали чисто приложенческие штуки: нижний таб-бар, вкладка «Поиск»,
свайп-пагинатор, кэш страниц, предзагрузка, волна текста и строка версии. Владелец:
«на сайте ничего не меняй».

Что теперь делает **только приложение** через скин:
- строка «версия <APK> · фронт <версия>» внизу страницы — элемент `#amore-ver`, который
  `ensureVersion()` добавляет в `#app` и заполняет из `AmoreApp.version()`.

### Скин шапки только для приложения

Правки, которых не должно быть на сайте, живут в `WebMainActivity.APP_SKIN_JS`
(`evaluateJavascript` в `onPageFinished`, не в assets): убран `<small>уроки</small>`,
`.userchip` прозрачный и прижат вправо (ника и роли нет), кнопка `⏻` заменена на `⚙`
с `onclick`, который ничего не делает. Навешивается `MutationObserver` + `data-skin="1"`,
потому что `render()` пересобирает шапку на каждой навигации.

Разрешены только `h.alc1.ru`, `auth.alc1.ru`, `my.alc1.ru` (все отдаются из assets/фронта);
`alc1.ru` и внешние ссылки не открываются. **Kotlin:** в `when` без субъекта условия нельзя
перечислять через запятую — только `||`.

### Консоль логов (долгий тап по «Дневник»)

Иконка в лончере одна — `WebMainActivity` (дневник). `ConsoleActivity` больше не лончер
(`exported=false`, без intent-filter): открывается **долгим нажатием 1,2 с** по «Дневник»
в шапке. Мост: `web.addJavascriptInterface({ openLogs() }, "AmoreApp")`, в `APP_SKIN_JS`
на `.topbar .brand` висят touchstart/mousedown с таймером (флаг `data-logs="1"`, чтобы не
вешать повторно после перерисовки шапки).

Вместо удалённого Compose-клиента — `ConsoleActivity`: чёрный экран с логами и кнопками
«Очистить»/«Копировать»/«Открыть дневник».

- `Logs.kt` — кольцевой буфер на 800 строк + подписка для UI, дублирует в logcat (`Amore`).
- Пишут: `WebChromeClient.onConsoleMessage` (тег `js`/`warn/js`/`err/js`, с файлом и строкой),
  навигация (`nav`), сетевые ошибки (`err/net`, `err/http`), скачивания (`dl`),
  автообновление (`update`, `warn/update`, `err/update`), запуск (`app`).
- На телефоне это единственный способ увидеть, почему WebView ругается — adb не нужен.

### Панель обновления

Не системный `AlertDialog`, а своя карточка — `UpdatePanel.kt`: скруглённый блок (26dp),
заголовок и цвет акцента зависят от типа (`critical` — красный, `recommended` — жёлтый,
`interface` — мятный), номер версии, размер, кнопки «Скачать»/«Позже»/«Пропустить».
Прогресс скачивания рисуется в этой же панели (для интерфейсных обновлений).

**Повтор не показываем:** нажатие пишет версию в `skip_version`,
и `check()` молча выходит, если она совпала с `latest`.

### Обновление ИНТЕРФЕЙСА (zip) и типы обновлений

Тип обновления выбирается по СМЫСЛУ правки (владелец, 29.10):

| Тип | Когда | Панель |
|---|---|---|
| `interface` | вёрстка, стили, тексты, кнопки — интерфейс | мятная, «ОБНОВЛЕНИЕ ИНТЕРФЕЙСА» |
| `recommended` | новая функция | жёлтая, «ЖЕЛАТЕЛЬНОЕ ОБНОВЛЕНИЕ» |
| `critical` | сломался API/структура (блок групп, схема данных) — без обновления не работает | красная, без «Пропустить» |

`publish-apk.sh --interface | --recommended | --critical`; фронт всегда `interface`.
Уровни хранятся по версиям в `dl/levels.json` — история не перезаписывается, манифест берёт
`level` оттуда (`latest_level` = уровень последнего релиза).

`SiteUpdater.check()` раз в час читает `h.alc1.ru/front.json`; если версия не совпала с
сохранённой (`SharedPreferences("site_update", front_version)`) — панель. По «Скачать»:
архив в `filesDir/front/` → проверка `size`/`sha256` → `unpack()` в `filesDir/site.tmp`
(защита от `../`) → атомарная подмена `site` (при сбое откат) → `web.reload()`.
`assetFor()` сначала ищет файл в `filesDir/site/...`, потом в `assets`.

Публикация: `publish-front.sh <версия>` (zip + `front.json` с `level:"interface"` в `dl/` и
`homework/`). Сброс на встроенный фронт — `SiteUpdater.resetToBuiltin()`.

### Ключ подписи

- `diary.jks` **убран из папки проекта** (иначе уедет в архив/гит вместе с кодом) →
  `/mnt/usr/alc/Amore/.keys/diary.jks`, права `600`, каталог `700`.
- Пароль сменён 27.10 с `okeyandokey` на сгенерированный (28 символов, base64): лежит в
  `.keys/diary.pass` (`600`), в чат и в код не пишется. Владельцу — перенести в менеджер паролей.
- Alias `key0`, PKCS12, отпечаток `807f7fd0…` (тот же ключ — обновления ставятся поверх).
- У PKCS12 `keypasswd` не поддерживается: пароль ключа = пароль хранилища, меняется только
  `keytool -storepasswd`.
- В Android Studio мастер «Generate Signed APK» помнит **старый путь** — при следующем
  использовании указать новый: `.keys/diary.jks`.

### Версии, имена APK и публикация

**Схема версии: `<global>.<semiglobal>.<release>.<debug>`**, например `0.3.5.143`.
**Если debug = `111`, версия показывается тремя числами:** `0.3.9.111` → `0.3.9`
(это делает `bump-version.sh`; `versionCode` остаётся полным 3009111, имена файлов и
`versions.json` получают `0.3.9`). `publish-apk.sh` понимает имена и из 3, и из 4 чисел,
при сортировке добивает до четырёх нулями.

| Часть | Смысл |
|---|---|
| `0` | глобальный масштаб (смена архитектуры, «версия 1.0») |
| `3` | полуглобальный шаг (крупная порция фич) |
| `5` | номер релиза |
| `143` | **debug-номер, 3 цифры: `1` — номер ошибки, `4` — попытка исправления, `3` — вариант исправления** |

Правило: **каждая правка — новая версия.** Правка того же релиза → меняется только debug
(`0.3.5.132` → `0.3.5.143` → `0.3.5.153`…). Новая порция фич → `release` +1, debug сбрасывается.
`versionCode` считается автоматически: `global*1e9 + semi*1e6 + release*1e3 + debug`
(растёт монотонно, влезает в int).

```bash
Diary/scripts/bump-version.sh 0.3.5.153     # пишет versionName и versionCode в build.gradle.kts
cd Diary && GRADLE_USER_HOME=/mnt/usr/alc/Amore/.gradle-home ./gradlew --offline -q :app:assembleRelease
Diary/scripts/publish-apk.sh                # zipalign + подпись + раскладка + versions.json
cd alc1.ru && bash scripts/sync.sh          # деплой
```

`publish-apk.sh` кладёт **`alc1.ru/dl/AmoreDiary-<версия>.apk`** (историю версий не затираем),
дублирует её в `dl/diary.apk` для старых ссылок и пересобирает манифест
`{"latest": "...", "files":[{version,file,size,date}...]}` **сканированием каталога**
(сортировка по числам версии, новые сверху). Манифест пишется **в двух местах**:
`alc1.ru/dl/versions.json` и `alc1.ru/homework/versions.json` — потому что страница
`h.alc1.ru/download.html` обязана брать его **со своего origin** (`/versions.json`).
Первый заход положил только в `dl/` → браузер запрашивал `h.alc1.ru/dl/versions.json` (404)
и версия не появлялась. Кросс-доменный запрос потребовал бы ещё и CORS — не надо.
Если менялись файлы `assets/site/` — **сначала** скопировать их в приложение (грабли 31),
иначе в APK уедет старый фронт.

### Иконка приложения

Логотип взят **с сайта**: в `homework.html` сплэш рисует открытую книгу мелом с жёлтым
корешком (`viewBox 0 0 64 64`, путь `M32 21c-5-4-12-4-18-2…`). Из него сделаны:

- `res/drawable/ic_launcher_foreground.xml` — тот же путь вектором, `group scale 1.15`
  и `translate 17.2`, чтобы содержимое влезло в safe-зону адаптивной иконки (108dp, центр 72dp);
- `res/drawable/ic_launcher_background.xml` — градиент «доски» `#17594B → #0A2E27`;
- `res/mipmap-{mdpi..xxxhdpi}/ic_launcher{,_round}.webp` — растровые для API < 26,
  генерируются `Diary/scripts/make-icons.sh` (chromium рендерит SVG → PIL композитит на градиент,
  скруглённый квадрат и круг).

**Грабли:** в XML-комментарии нельзя `--`. Написал в комментарии имена CSS-переменных
(`--sun`, `--board`) → сборка упала: `The string "--" is not permitted within comments`.
Писать «sun», «board» без дефисов.

### Обновление APK: тот же путь, что у интерфейса

**Любая** панель (critical/recommended/interface) работает одинаково: скачали файл сами →
распаковали → подменили файлы → перезагрузили WebView. Для APK источником служит
`assets/site/...` внутри скачанного APK (`applyFromApk`), для интерфейса — zip из `front.json`.
Нативные изменения (Kotlin) без установки APK не приедут — это ограничение платформы;
скачанный APK остаётся в `filesDir/front/`, и при необходимости его можно поставить вручную.

`AutoUpdate.kt` раз в минуту и на `onResume` читает `versions.json`, сравнивает `latest` с
`versionName`; по нажатию качает APK в `filesDir/front/`, проверяет размер и передаёт в
`SiteUpdater.applyFromApk()`. Из манифеста убраны `REQUEST_INSTALL_PACKAGES`, `FileProvider`,
`file_paths.xml`, `InstallResultReceiver` (иначе Play Protect блокировал). «Скачать» пишет
`skip_version` — панель не всплывает повторно.
