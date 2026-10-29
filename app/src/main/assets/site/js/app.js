/* app.js */
const S = {
  ses:null, me:null, tab:'login', pow:false, formOpened:Date.now(),
  groups:[], lessons:[], users:[], feed:[], stats:{}, groupMap:new Map(),
  sched:[], cancels:new Set(), pubs:[], audit:[], schedData:null,
  gtab:'hw', weekOff:0, notifs:[], linkReqs:[], reports:[],
  viewUser:null, wizard:null, userSort:null,
  navGroups:null, navOpen:true, navLoaded:false
};
const API_BASE = '/api/';
const API = {
  async get(url){
    const r=await fetch(API_BASE+url);
    const j=await r.json();
    if(!j.ok) throw new Error(j.error);
    return j;
  },
  async post(url,data){
    const r=await fetch(API_BASE+url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    const j=await r.json();
    if(!j.ok) throw new Error(j.error);
    return j;
  }
};
function go(h){ location.hash=h; }
function qp(name){
  const i=location.hash.indexOf('?');
  if(i<0) return null;
  return new URLSearchParams(location.hash.slice(i+1)).get(name);
}

/* короткие ссылки /@slug */
const APP_PATH = API_BASE.replace(/api\/?$/,'');
function pathSlug(){
  const m = decodeURIComponent(location.pathname).match(/@([a-z0-9_-]{3,24})\/?$/i);
  return m ? m[1].toLowerCase() : null;
}
async function consumeSlug(){
  const slug = pathSlug();
  if(!slug) return;
  let target = null;
  try{
    const r = await API.get('auth?a=resolve&slug='+encodeURIComponent(slug));
    target = (r.kind==='user' ? '#/user?id=' : '#/group?id=') + encodeURIComponent(r.id);
  }catch(e){
    if(typeof toast==='function') toast('Ссылка @'+slug+' не найдена','err');
  }
  try{ history.replaceState(null,'',APP_PATH+(target||'')); }
  catch(e){ if(target) location.hash = target; }
}

/* ═══ SSO: локальной авторизации нет, вход через alc1.ru ═══ */
const AUTH_URL = 'https://auth.alc1.ru/';
function getCookie(n){
  const m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));
  return m?decodeURIComponent(m[1]):null;
}
function delCookie(n){
  document.cookie=n+'=;path=/;domain=.alc1.ru;max-age=0;Secure;SameSite=Lax';
}

function landingScreen(){
  return `
  <header class="topbar" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:10px 18px;position:relative;">
    <a class="brand" href="#/" style="position:static;">📗 Дневник <small>уроки</small></a>
    <div class="dim" style="flex:1;min-width:220px;text-align:center;font-size:13px;line-height:1.4;">
      электронный журнал уроков и ДЗ · частные группы · шифрование данных · проект Amore / ALC
    </div>
    <a class="btn sun" style="text-decoration:none;white-space:nowrap;" href="${AUTH_URL}?next=h">Войти&nbsp;→</a>
  </header>
  <div class="auth">
    <div class="board">
      <span class="over">электронный дневник</span>
      <h1>Журнал <span class="hl">уроков</span> и домашних заданий</h1>
      <div class="hand">частные группы · без чата · расписание и аудит ✋</div>
      <ul class="chalklist">
        <li><span class="ic">🔒</span><span><b>Частные группы.</b> ДЗ видны только участникам.</span></li>
        <li><span class="ic">🗓</span><span><b>Расписание Пн–Сб.</b> Отмена урока переносит ДЗ на следующий.</span></li>
        <li><span class="ic">👥</span><span><b>Автономия групп.</b> Куратор назначает, кто выкладывает ДЗ.</span></li>
      </ul>
      <div class="hand" style="margin-top:auto;padding-top:30px">* кнопка входа — на панели наверху ↗</div>
      <div class="tray"><i></i><i></i><i></i></div>
    </div>
    <div class="card-auth paper holes" style="padding:34px 32px;">
      <h2 style="font-size:22px;margin:0 0 10px;">О проекте</h2>
      <p class="dim" style="font-size:14px;line-height:1.65;margin:0 0 18px;">
        «Дневник» — электронный журнал уроков и домашних заданий: частные группы,
        расписание с отменами уроков, аудит действий и шифрование данных. Без чатов и лишнего шума.
      </p>
      <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed #d9cfb4;font-size:14px;">
        <span class="dim">Компания</span><b>Amore Studio</b>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed #d9cfb4;font-size:14px;">
        <span class="dim">CEO</span><b>ALC</b>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed #d9cfb4;font-size:14px;">
        <span class="dim">Проект</span><b>Дневник · активен</b>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;font-size:14px;">
        <span class="dim">Вход</span><b><a href="${AUTH_URL}?next=h" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">auth.alc1.ru</a></b>
      </div>
      <p class="tiny-note" style="text-align:center;margin-top:16px;">Amore studio · ALC — CEO · «твори кодом»</p>
    </div>
  </div>${FOOT}`;
}

let BOOT_STARTED = false;
async function boot(){
  if(typeof render !== 'function'){ setTimeout(boot, 100); return; }
  const app=$('#app');
  if(!app){ console.log('Ждём DOM... (#app не найден)'); setTimeout(boot, 200); return; }
  if(BOOT_STARTED) return;          // второй запуск (watchdog) не нужен
  BOOT_STARTED = true;
  await consumeSlug();

  /* подвязка: свежий тикет из куки .alc1.ru -> сессия дневника */
  const tk = getCookie('hw_ticket');
  if(tk){
    try{
      const r = await API.post('auth?a=sso_exchange',{ticket:tk});
      delCookie('hw_ticket');
      localStorage.setItem('hw_session', JSON.stringify(r.session));
      S.ses={uid:r.session.uid, prv:r.session.prv||null};
      S.me=r.session;
      history.replaceState(null,'',APP_PATH);
      render();
      return;
    }catch(e){ delCookie('hw_ticket'); }
  }

  const saved=localStorage.getItem('hw_session');
  if(saved){
    try{
      const sess=JSON.parse(saved);
      if(sess.prv && sess.pub){
        try{
          const pub = typeof sess.pub==='string' ? JSON.parse(sess.pub) : sess.pub;
          if(pub.n && sess.prv.n && pub.n!==sess.prv.n) throw 0;
        }catch(e){
          localStorage.removeItem('hw_session');
          S.ses=null; S.me=null;
          render(landingScreen());
          return;
        }
      }
      S.ses={uid:sess.uid, prv:sess.prv || null};
      S.me={...sess, slug:sess.slug || null};
      try{
        const r = await API.get('auth?a=me');
        if(r.ok && r.user.id === S.ses.uid){ render(); return; }
      }catch(e){
        /* Разлогиниваем только при явном 401 («Требуется вход»). Раньше любая
           временная ошибка (404 во время перезапуска API, обрыв сети) стирала
           сохранённую сессию и человек оказывался на странице входа. */
        if(String((e && e.message) || '').indexOf('Требуется вход') >= 0){
          localStorage.removeItem('hw_session');
          S.ses = null; S.me = null;
        }
      }
      if(S.ses.prv){ render(); return; }
      render(landingScreen());
    }catch(e){ render(landingScreen()); }
    return;
  }
  render(landingScreen());
}

async function route(){
  const h=location.hash||'#/';
  if(!S.ses) return {title:'Дневник', html:landingScreen()};
  /* уведомления грузим на каждой навигации — раньше они вообще не запрашивались */
  try{
    const n = await API.get('auth?a=notifications');
    S.notifs = n.items || [];
  }catch(e){ /* тихо: не мешаем странице */ }
  if(!S.navLoaded){                       // папка «Мои группы» в сайдбаре
    try{ S.navGroups=((await API.get('groups?a=')).groups||[]).map(g=>({id:g.id,name:g.name})); }
    catch(e){ S.navGroups=[]; }
    S.navLoaded=true;
  }
  if(h==='#/' || h==='#'){
    try{
      const r=await API.get('lessons?a=feed');
      S.feed=r.lessons; S.stats=r.stats;
      S.groups=r.groups; S.groupMap=new Map(r.groups.map(g=>[g.id,g]));
      S.navGroups=r.groups.map(g=>({id:g.id,name:g.name})); S.navLoaded=true;
      return {title:'Главная', html:shell(pageHome())};
    }catch(e){ return {title:'Главная', html:shell('<div class="empty">Ошибка загрузки</div>')}; }
  }
  if(h==='#/groups'){
    try{
      const r=await API.get('groups?a=');
      S.groups=r.groups;
      S.navGroups=r.groups.map(g=>({id:g.id,name:g.name})); S.navLoaded=true;
      S.navOpen=true;
      return {title:'Группы', html:shell(pageGroups())};
    }catch(e){ return {title:'Группы', html:shell('<div class="empty">Ошибка</div>')}; }
  }
  if(h.startsWith('#/group')){
    const id=qp('id');
    if(!id) return {title:'Группа', html:shell('<div class="empty">ID группы не указан</div>')};
    try{
      const r=await API.get('groups?a=view&id='+encodeURIComponent(id));
      S.lessons=r.lessons; S.groups=[r.group];
      const ng=S.navGroups||[];
      const ex=ng.find(x=>x.id===r.group.id);
      if(ex) ex.name=r.group.name; else ng.unshift({id:r.group.id,name:r.group.name});
      S.navGroups=ng;
      S.sched=r.schedule||[];
      S.cancels=new Set((r.cancels||[]).map(c=>c.date+'|'+c.slot_id));
      S.pubs=r.group.publishers||[]; S.audit=r.audit||[];
      return {title:r.group.name, html:shell(pageGroup(id))};
    }catch(e){ return {title:'Группа', html:shell('<div class="empty">Группа не найдена</div>')}; }
  }
  if(h.startsWith('#/user')){
    const uid = qp('id');
    if(!uid) return {title:'Профиль', html:shell('<div class="empty">ID пользователя не указан</div>')};
    try{
      const r = await API.get('auth?a=user&id=' + encodeURIComponent(uid));
      S.viewUser = r.user;
      return {title: r.user.nick, html: shell(pageUser())};
    }catch(e){
      return {title:'Профиль', html: shell('<div class="empty">Пользователь не найден</div>')};
    }
  }
  if(h==='#/admin'){
    try{
      const r=await API.get('admin?a=');
      S.users=r.users; S.stats=r.stats;
      const lr=await API.get('customlink?a=pending'); S.linkReqs=lr.requests||[];
      const rp=await API.get('reports?a=list'); S.reports=rp.rows||[];
      return {title:'Админ', html:shell(pageAdmin())};
    }catch(e){ return {title:'Админ', html:shell('<div class="empty">Ошибка</div>')}; }
  }
  if(h==='#/profile'){
    try{
      const r=await API.get('lessons?a=feed');
      S.feed=r.lessons; S.stats=r.stats;
      S.groups=r.groups; S.groupMap=new Map(r.groups.map(g=>[g.id,g]));
      S.navGroups=r.groups.map(g=>({id:g.id,name:g.name})); S.navLoaded=true;
    }catch(e){}
    return {title:'Профиль', html:shell(pageProfile())};
  }
  return {title:'404', html:shell('<div class="empty">Страница не найдена</div>')};
}

async function render(html, silent){
  const app=$('#app');
  if(!app){ console.error('#app не найден, ждём DOM...'); setTimeout(()=>render(html), 100); return; }
  const firstPaint = !document.body.classList.contains('ready');
  const smooth = !html && !firstPaint && !silent && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(smooth){
    app.classList.add('swapping');
    await new Promise(r=>setTimeout(r, 120));
  }
  if(html){
    app.innerHTML=html;
  } else {
    try{
      const r=await route();
      document.title=r.title+' — Дневник';
      app.innerHTML=r.html;
    }catch(e){
      app.innerHTML='<div class="empty">Ошибка: '+esc(e.message)+'</div>';
    }
  }
  app.classList.remove('swapping');
  /* Плавное появление интерфейса после заставки: класс .appear живёт только
     на первой отрисовке. Снимаем его по animationend (иначе animation-fill
     перебивает transition .swapping при смене страниц) + страховка таймером. */
  if(firstPaint && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    app.classList.add('appear');
    const appeared = (e) => {
      if (e && e.target !== app) return;   // чужие анимации внутри #app не в счёт
      app.classList.remove('appear');
      app.removeEventListener('animationend', appeared);
    };
    app.addEventListener('animationend', appeared);
    setTimeout(appeared, 1500);
  }
  document.body.classList.add('ready');   // прячем сплэш, дальше без анимаций появления
  /* В Firefox CSS-анимация заставки перекрывала opacity:0 из правила body.ready,
     поэтому гасим её инлайново с !important и убираем узел из DOM. */
  const sp = document.getElementById('splash');
  if (sp) {
    sp.style.setProperty('opacity', '0', 'important');
    sp.style.setProperty('visibility', 'hidden', 'important');
    setTimeout(() => { try { sp.remove(); } catch (e) {} }, 700);
  }
  if(typeof hydrate==='function') hydrate();
  if(typeof startLivePoll==='function') startLivePoll();   // тихий опрос раз в секунду
}
window.addEventListener('hashchange', ()=>render());
/* Запускаемся сразу: раньше ждали window.load, а он не наступает, пока не
   догрузятся внешние шрифты Google. Если fonts.googleapis.com висит —
   приложение не стартовало вовсе и висела заставка. */
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* Страховка: если через 7 секунд экран так и не появился — пробуем ещё раз */
setTimeout(()=>{
  if(!document.body.classList.contains('ready')){
    BOOT_STARTED = false;
    boot();
  }
}, 7000);