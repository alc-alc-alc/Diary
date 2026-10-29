const HW_API = 'https://h.alc1.ru/api/';
const NICK_RE = /^[\w\u0400-\u04FF-]{3,16}$/, MIN_PW = 8;
const $ = id => document.getElementById(id);

/* ——— кто вошёл (cookie ставит страница входа) ——— */
function getCookie(n){const m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null;}
function setCookie(n,v,sec){document.cookie=n+'='+encodeURIComponent(v)+';path=/;domain=.alc1.ru;max-age='+sec+';Secure;SameSite=Lax';}
function clearAuthCookies(){['hw_nick','hw_ticket'].forEach(n=>{document.cookie=n+'=;path=/;domain=.alc1.ru;max-age=0;Secure;SameSite=Lax';});}
let NICK = getCookie('hw_nick');
if(!NICK || NICK==='undefined' || NICK==='null'){ location.replace('https://auth.alc1.ru/?next=account'); }
else $('who').textContent = NICK;

/* ——— сообщения и состояния ——— */
const showErr = e => { $('info').textContent=''; $('err').textContent = (e && e.message) ? e.message : String(e); };
const showInfo = t => { $('err').textContent=''; $('info').textContent = t; };
const clearMsg = () => { $('err').textContent=''; $('info').textContent=''; };
const esc = t => String(t==null?'':t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setBusy(btn, on, text){
    if(on){ btn.dataset.t = btn.textContent; btn.textContent = text; btn.disabled = true; }
    else { if(btn.dataset.t) btn.textContent = btn.dataset.t; btn.disabled = false; }
}
async function call(a, data){
    let r;
    try{ r = await fetch(HW_API + 'auth?a=' + a, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)}); }
    catch(_){ throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'); }
    const j = await r.json().catch(()=>null);
    if(!j) throw new Error('Сервер вернул пустой ответ (HTTP '+r.status+')');
    if(!j.ok){
        if(r.status === 404) throw new Error('Аккаунт с таким ником не найден. Выйдите и войдите заново.');
        throw new Error(j.error || 'Ошибка');
    }
    return j;
}

/* ——— вкладки ——— */
let KEY_PENDING = false;
function show(v){
    if(KEY_PENDING && v !== 'key') return showErr('Сначала сохраните ключ и нажмите «Готово»');
    ['nick','pw','key','sess'].forEach(n => {
        $('v-'+n).hidden = n !== v;
        document.querySelector('.tab[data-v="'+n+'"]').setAttribute('aria-current', String(n === v));
    });
    clearMsg();
    if(v === 'sess') loadSessions();
    if(history.replaceState) history.replaceState(null, '', '#' + v);
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.v)));
const start = (location.hash || '').slice(1); show(['nick','pw','key','sess'].includes(start) ? start : 'nick');

document.querySelectorAll('.reveal').forEach(b => b.addEventListener('click', () => {
    const inp = $(b.dataset.for), open = inp.type === 'password';
    inp.type = open ? 'text' : 'password'; b.textContent = open ? 'Скрыть' : 'Показать'; b.setAttribute('aria-pressed', String(open));
}));

/* ——— сменить ник ——— */
$('v-nick').addEventListener('submit', async e => {
    e.preventDefault(); clearMsg();
    const nn = $('nk-new').value.trim(), pw = $('nk-pw').value;
    if(!NICK_RE.test(nn)) return showErr('Ник: 3–16 символов, только буквы, цифры, _ и -');
    if(nn === NICK) return showErr('Это ваш текущий ник');
    if(!pw) return showErr('Введите текущий пароль');
    const btn = $('nk-btn'); setBusy(btn, true, 'Меняем…');
    try{
        const j = await call('sso_change_nick', {nick: NICK, password: pw, new_nick: nn});
        NICK = j.nick; setCookie('hw_nick', NICK, 7*86400); $('who').textContent = NICK;
        $('nk-new').value = ''; $('nk-pw').value = '';
        showInfo('Готово, теперь ваш ник ' + NICK + '. В «Дневнике» он обновится после повторного входа.');
    }catch(err){ showErr(err); }
    finally{ setBusy(btn, false); }
});

/* ——— сменить пароль ——— */
$('v-pw').addEventListener('submit', async e => {
    e.preventDefault(); clearMsg();
    const old = $('pw-old').value, nw = $('pw-new').value;
    if(!old) return showErr('Введите текущий пароль');
    if(nw.length < MIN_PW) return showErr('Новый пароль: минимум ' + MIN_PW + ' символов');
    if(nw === old) return showErr('Новый пароль совпадает с текущим');
    const btn = $('pw-btn'); setBusy(btn, true, 'Меняем…');
    try{
        await call('sso_change_password', {nick: NICK, password: old, new_password: nw});
        $('pw-old').value = ''; $('pw-new').value = '';
        showInfo('Пароль изменён. В «Дневнике» войдите заново с новым паролем.');
    }catch(err){ showErr(err); }
    finally{ setBusy(btn, false); }
});

/* ——— новый ключ восстановления ——— */
let CODE = '';
$('ky-form').addEventListener('submit', async e => {
    e.preventDefault(); clearMsg();
    const old = $('ky-old').value.trim();
    if(old.replace(/[^A-Za-z0-9]/g,'').length !== 24) return showErr('Ключ восстановления состоит из 24 символов, например XXXX-XXXX-XXXX-XXXX-XXXX-XXXX');
    const btn = $('ky-btn'); setBusy(btn, true, 'Выпускаем…');
    try{
        const j = await call('sso_new_recovery', {nick: NICK, recovery: old});
        CODE = j.recovery; $('ky-code').textContent = CODE; $('ky-old').value = '';
        $('ky-ok').checked = false; $('ky-done').disabled = true;
        $('ky-form').hidden = true; $('ky-show').hidden = false; KEY_PENDING = true;
        window.onbeforeunload = () => 'Вы не сохранили новый ключ восстановления.';
    }catch(err){ showErr(err); }
    finally{ setBusy(btn, false); }
});
$('ky-ok').addEventListener('change', e => { $('ky-done').disabled = !e.target.checked; });
$('ky-copy').addEventListener('click', async () => {
    const b = $('ky-copy'), t = b.textContent;
    try{ await navigator.clipboard.writeText(CODE); b.textContent = 'Скопировано'; }
    catch(_){ const r = document.createRange(); r.selectNodeContents($('ky-code')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Выделено, нажмите Ctrl+C'; }
    setTimeout(() => b.textContent = t, 2200);
});
$('ky-dl').addEventListener('click', () => {
    const txt = 'Amore: ключ восстановления\r\nАккаунт: ' + NICK + '\r\nКлюч: ' + CODE +
        '\r\n\r\nХраните ключ отдельно от пароля. Он нужен, чтобы задать новый пароль и не потерять данные.\r\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], {type:'text/plain;charset=utf-8'}));
    a.download = 'amore-recovery-' + NICK + '.txt';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('ky-done').addEventListener('click', () => {
    CODE = ''; $('ky-code').textContent = ''; KEY_PENDING = false; window.onbeforeunload = null;
    $('ky-show').hidden = true; $('ky-form').hidden = false;
    showInfo('Новый ключ сохранён. Старый больше не действует.');
});

/* ——— выход ——— */
$('logout').addEventListener('click', () => {
    if(KEY_PENDING && !confirm('Вы не сохранили новый ключ. Всё равно выйти?')) return;
    window.onbeforeunload = null; clearAuthCookies();
    fetch(HW_API + 'auth?a=logout', {method:'POST', credentials:'include'}).catch(()=>{}).finally(() => location.href = 'https://alc1.ru/');
});
/* ——— сеансы: список и завершение (только для сеанса старше 5 часов) ——— */
async function loadSessions(){
    const box = $('sess-list'), note = $('sess-note');
    box.innerHTML = '<p class="view-text">Загрузка…</p>';
    try{
        const r = await fetch(HW_API + 'auth?a=sso_sessions', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}', credentials:'include'});
        const j = await r.json();
        if(!j || !j.ok){
            box.innerHTML = '';
            note.textContent = (j && j.error) ? j.error : 'Не удалось получить список сеансов.';
            return;
        }
        const now = Date.now() / 1000;
        box.innerHTML = j.items.map(s => {
            const cur = s.id === j.current;
            const hours = Math.max(0, Math.round((now - s.created) / 3600));
            const when = hours < 1 ? 'меньше часа назад' : hours + ' ч назад';
            const kill = (!cur && j.unlocked) ? `<button type="button" class="btn ghost" data-kill="${esc(s.id)}">Завершить</button>` : '';
            return `<div class="meta-item" style="display:flex;align-items:center;gap:10px">
                <span><b>${cur ? 'этот сеанс' : 'другой сеанс'}</b> · вход ${when}${s.ip ? ' · ' + esc(s.ip) : ''}${s.ua ? '<br><span class="dim" style="font-size:11px">' + esc(s.ua.slice(0, 60)) + '</span>' : ''}</span>
                <span style="margin-left:auto">${kill}</span></div>`;
        }).join('') || '<p class="view-text">Активных сеансов нет.</p>';
        note.textContent = j.unlocked
            ? 'Текущий сеанс старше 5 часов — другие можно завершать.'
            : 'Завершать другие сеансы можно через ' + Math.ceil(j.unlock_in / 3600) + ' ч после входа в этот.';
        box.querySelectorAll('[data-kill]').forEach(b => b.addEventListener('click', async () => {
            b.disabled = true;
            try{ await call('sso_kill_session', {id: b.dataset.kill}); await loadSessions(); }
            catch(err){ showErr(err); b.disabled = false; }
        }));
    }catch(err){ box.innerHTML = ''; showErr(err); }
}
$('sess-refresh').addEventListener('click', loadSessions);
