/* profile.js — карточка профиля на my.alc1.ru (стиль Amore)
   Работает и как /@slug — тогда показывает публичную карточку участника. */
const HW_API = 'https://h.alc1.ru/api/';
const $ = id => document.getElementById(id);
const ROLE_NAMES = { owner: 'Владелец', admin: 'Админ', mod: 'Модератор' };

function getCookie(n){
    const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
}
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const viewedMatch = location.pathname.match(/^\/@([A-Za-z0-9_-]{3,24})\/?$/);
const VIEWED = viewedMatch ? viewedMatch[1].toLowerCase() : null;
const NICK = getCookie('hw_nick');

if(!NICK || NICK === 'undefined' || NICK === 'null'){
    location.replace('https://auth.alc1.ru/?next=account');
} else {
    $('who').textContent = NICK;
    $('av').textContent = (NICK[0] || 'A').toUpperCase();
    (VIEWED ? loadViewed(VIEWED) : loadOwn());
}

async function api(path, opts){
    const r = await fetch(HW_API + path, Object.assign({ credentials: 'include' }, opts || {}));
    const j = await r.json().catch(() => null);
    if(!j || !j.ok) throw new Error((j && j.error) || ('Ошибка ' + r.status));
    return j;
}

async function loadOwn(){
    try{
        const { user } = await api('auth?a=me');
        paint(user, true);
    }catch(e){
        $('pslug').textContent = e.message || 'Ошибка загрузки';
    }
}

async function loadViewed(slug){
    try{
        const res = await api('auth?a=resolve&slug=' + encodeURIComponent(slug));
        if(res.kind !== 'user') throw new Error('Это ссылка на группу, а не на профиль');
        const { user } = await api('auth?a=user&id=' + encodeURIComponent(res.id));
        let me = null;
        try{ me = (await api('auth?a=me')).user; }catch(_){}
        paint(user, !!(me && me.id === user.id));
    }catch(e){
        $('pnick').textContent = '@' + slug;
        $('pslug').textContent = e.message || 'Профиль не найден';
        $('pactions').hidden = true;
        $('lead').textContent = 'Публичная карточка участника Amore.';
        $('meta-settings').hidden = true;
    }
}

function paint(u, isMe){
    const nick = u.nick || NICK;
    $('pnick').textContent = nick;
    $('av').textContent = (nick[0] || 'A').toUpperCase();
    $('who').textContent = nick;

    const role = $('prole');
    if(ROLE_NAMES[u.role]){
        role.hidden = false;
        role.textContent = ROLE_NAMES[u.role];
        role.dataset.role = u.role;
    }
    if(u.ts){
        const d = new Date(u.ts * 1000);
        $('pts').textContent = 'с ' + d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
    }
    if(u.slug){
        $('pslug').innerHTML = 'Публичная ссылка: <a href="/@' + esc(u.slug) + '">/@' + esc(u.slug) + '</a>';
    } else {
        $('pslug').textContent = 'Публичная ссылка не задана — можно выбрать в настройках.';
    }

    if(isMe){
        $('lead').innerHTML = 'Вы вошли как <span class="nickchip">' + esc(nick) + '</span>. Это ваша карточка — отсюда вход в настройки и в дневник.';
        $('meta-settings').hidden = false;
        $('btn-settings').hidden = false;
        $('pactions').hidden = false;
        document.title = nick + ' — Профиль Amore';
    } else {
        $('lead').innerHTML = 'Публичная карточка участника <b>Amore</b>. Группы и ДЗ видны только их участникам.';
        $('meta-settings').hidden = true;
        $('btn-settings').hidden = true;
        $('pactions').hidden = false;
        document.title = nick + ' — Профиль Amore';
    }
}

$('logout').addEventListener('click', async () => {
    try{ await fetch(HW_API + 'auth?a=logout', { method: 'POST', credentials: 'include' }); }catch(_){}
    location.href = 'https://alc1.ru/';
});
