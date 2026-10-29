/* ═══════════ render.js: экраны и шаблоны ═══════════ */
let PENDING=[];
async function hydrate(){
  for(const p of PENDING){
    const el=document.getElementById(p.elId); if(!el) continue;
    const l=p.l;
    /* Текст уже расшифровывали в этой сессии — берём из кеша, чтобы точечные
       обновления (отметка «выполнено») не показывали «Загрузка…» заново. */
    if(l._body!=null){
      el.className='lbody';
      el.textContent=p.preview?(l._body.length>170?l._body.slice(0,170)+'…':l._body):l._body;
      continue;
    }
    if(!l.keys[S.ses.uid]){ el.className='lbody locked'; el.innerHTML='🔒 Нет доступа.'; continue; }
    try{
      const text=await decryptLesson(l);
      l._body=text;                                  // кеш открытого текста на объекте урока
      el.className='lbody'; el.textContent=p.preview?(text.length>170?text.slice(0,170)+'…':text):text;
    }catch(e){
      el.className='lbody locked';
      el.innerHTML='Не удалось загрузить урок. <button class="btn tiny ghost" onclick="logoutFull()">Войти заново</button>';
    }
  }
  PENDING=[];
}
const ACTION_LABELS={create:'создал(а) группу',join:'вошёл(ла) в группу',kick:'исключил(а) участника',
  schedule:'изменил(а) расписание',cancel:'отменил(а) урок',uncancel:'снял(а) отмену урока',
  hw_add:'выложил(а) ДЗ',hw_edit:'исправил(а) ДЗ',hw_del:'удалил(а) ДЗ',
  pub_add:'назначил(а) издателя',pub_del:'снял(а) издателя'};

/* ДЗ относится к ПЕРВОМУ не отменённому уроку предмета, который начинается ПОСЛЕ публикации ДЗ.
   Раньше искали «ближайший урок от сегодняшней даты» без времени: ДЗ, выложенное в 18:00,
   считалось заданным на утренний урок того же дня (08:00), который давно прошёл. */
function hwOccurrence(l, sched, cancels){
  const sub=String(l.sub||'').trim().toLowerCase();
  if(!sub) return null;
  const rows=(sched||[]).filter(r=>String(r.subject||'').trim().toLowerCase()===sub);
  if(!rows.length) return null;
  const mins=r=>{ const m=String(r.start||'').match(/(\d{1,2})[:.](\d{2})/); return m?(+m[1])*60+(+m[2]):0; };
  const posted=new Date((+l.ts||0)*1000);
  const postedMin=posted.getHours()*60+posted.getMinutes();
  const base=new Date(posted.getFullYear(),posted.getMonth(),posted.getDate());
  for(let i=0;i<=60;i++){
    const d=new Date(base); d.setDate(base.getDate()+i);
    const wd=d.getDay(); if(wd===0) continue;                      // воскресенье — выходной
    const date=isoLocal(d);
    const dayRows=rows.filter(r=>+r.day===wd).sort((a,b)=>mins(a)-mins(b));
    for(const r of dayRows){
      if(i===0 && mins(r)<=postedMin) continue;                    // этот урок уже начался
      if(cancels && cancels.has(date+'|'+r.id)) continue;          // отменённый — переносим на следующий
      return {date,row:r};
    }
  }
  return null;
}
function hwDueText(occ){
  if(!occ) return 'предмет вне расписания';
  const m=String(occ.row.start||'').match(/(\d{1,2})[:.](\d{2})/);
  const p=occ.date.split('-').map(Number);
  const at=new Date(p[0],p[1]-1,p[2],m?+m[1]:0,m?+m[2]:0);
  return (at<new Date()?'урок был ':'до урока ')+fmtRuDate(occ.date)+' '+occ.row.start;
}

/* Бейдж класса («9 А»). Лежит внутри заголовка, который светлый, а фон чипа кремовый —
   поэтому цвет текста задаём явно (иначе светлое на светлом). */
function classChip(g){
  if(!(g.class||g.letter)) return '';
  return `<span class="chip" style="color:#1f3d2e;font-weight:700">${esc(g.class||'')} ${esc(g.letter||'')}</span>`;
}

/* Реакции на ДЗ. Каталог и порядок — здесь; ключи должны совпадать
   с REACTION_KEYS в homework/api/lessons.py. У пользователя одна реакция на урок. */
const REACTIONS = [
  {k:'fire', e:'🔥', t:'огонь'},       {k:'heart', e:'❤️', t:'сердце'},
  {k:'67', e:'67', t:'шесть-семь'},    {k:'thumbsup', e:'👍', t:'класс'},
  {k:'thumbsdown', e:'👎', t:'не очень'}, {k:'clap', e:'👏', t:'аплодисменты'},
  {k:'laugh', e:'😂', t:'смех'},       {k:'joy', e:'😄', t:'радость'},
  {k:'smile', e:'🙂', t:'улыбка'},     {k:'cool', e:'😎', t:'круто'},
  {k:'think', e:'🤔', t:'думаю'},      {k:'cry', e:'😭', t:'рыдаю'},
  {k:'sob', e:'😢', t:'грусть'},       {k:'angry', e:'😡', t:'злость'},
  {k:'wow', e:'😮', t:'вау'},          {k:'love', e:'😍', t:'влюблён'},
  {k:'party', e:'🥳', t:'праздник'},   {k:'rocket', e:'🚀', t:'ракета'},
  {k:'star', e:'⭐', t:'звезда'},      {k:'sparkles', e:'✨', t:'искры'},
  {k:'eyes', e:'👀', t:'глаза'},       {k:'brain', e:'🧠', t:'мозг'},
  {k:'skull', e:'💀', t:'смерть'},     {k:'ghost', e:'👻', t:'призрак'},
  {k:'poop', e:'💩', t:'ну такое'},    {k:'ok', e:'👌', t:'ок'},
  {k:'wave', e:'👋', t:'привет'},      {k:'pray', e:'🙏', t:'спасибо'},
  {k:'muscle', e:'💪', t:'сила'},      {k:'trophy', e:'🏆', t:'победа'},
  {k:'medal', e:'🥇', t:'медаль'},     {k:'bulb', e:'💡', t:'идея'},
  {k:'alarm', e:'⏰', t:'дедлайн'},    {k:'coffee', e:'☕', t:'кофе'},
  {k:'pizza', e:'🍕', t:'пицца'},      {k:'cake', e:'🍰', t:'торт'},
  {k:'cat', e:'🐱', t:'кот'},          {k:'dog', e:'🐶', t:'пёс'},
  {k:'rainbow', e:'🌈', t:'радуга'},   {k:'zap', e:'⚡', t:'молния'}
];
const REACTION_DEFAULT = ['heart', 'fire', '67', 'thumbsup', 'laugh'];
const REACTION_BY_KEY = new Map(REACTIONS.map(r => [r.k, r]));

function recentReactions(){
  let a = [];
  try{ a = JSON.parse(localStorage.getItem('hw_reactions_recent') || '[]') || []; }catch(e){ a = []; }
  a = a.filter(k => REACTION_BY_KEY.has(k));
  return (a.length ? a : REACTION_DEFAULT).slice(0, 5);
}
function myReaction(l){
  const rs = l.reactions || {};
  for(const k of Object.keys(rs)) if(rs[k] && rs[k].mine) return k;
  return null;
}
function reactionCell(l, r){
  const s = (l.reactions || {})[r.k] || {n:0, mine:false};
  return `<button class="rp-e${s.mine?' on':''}" data-kind="${r.k}" title="${r.t}"
    onclick="event.stopPropagation();setReaction('${l.id}','${r.k}')">${r.e}${s.n?`<i>${s.n}</i>`:''}</button>`;
}
/* Реакции видны всем: чипы с эмодзи и количеством стоят справа в футере
   (своя — подсвечена), а 🔥 открывает панель выбора. */
function reactionBarHTML(l){
  const rs = l.reactions || {};
  const order = k => REACTIONS.findIndex(r => r.k === k);
  const list = REACTIONS.filter(r => rs[r.k] && rs[r.k].n > 0)
    .sort((a, b) => (rs[b.k].n - rs[a.k].n) || (order(a.k) - order(b.k)));
  const shown = list.slice(0, 5);
  const rest = list.length - shown.length;
  const chip = r => {
    const s = rs[r.k];
    return `<button class="react-chip${s.mine ? ' on' : ''}" data-kind="${r.k}" title="${r.t}"
      onclick="setReaction('${l.id}','${r.k}')">${r.e}<b>${s.n}</b></button>`;
  };
  const recents = recentReactions();
  return `
    ${shown.map(chip).join('')}${rest > 0 ? `<span class="react-more" title="ещё ${rest}">+${rest}</span>` : ''}
    <button class="react-btn" onclick="toggleReactPop(this)" title="Поставить реакцию" aria-label="Поставить реакцию">
      <span>🔥</span>
    </button>
    <div class="react-pop" onclick="event.stopPropagation()">
      <div class="rp-cap">Недавние</div>
      <div class="rp-row">${recents.map(k => reactionCell(l, REACTION_BY_KEY.get(k))).join('')}
        <button class="rp-more" onclick="toggleReactFull(this)" title="Все реакции" aria-label="Все реакции">›</button>
      </div>
      <div class="rp-cap rp-cap-all">Все реакции</div>
      <div class="rp-full">${REACTIONS.map(r => reactionCell(l, r)).join('')}</div>
    </div>`;
}

function lessonCard(l,g,dueText,sfx){
  const elId='lb-'+(sfx||'')+l.id;
  const cached = l._body!=null;              // уже расшифровано — рендерим сразу, без «Загрузка…»
  if(!cached) PENDING.push({l,elId,preview:false});
  const done=l.doneBy.includes(S.ses.uid);
  const canEdit=g&&g.canPublish;
  return `
  <article class="lesson paper holes lines" data-lid="${l.id}">
    <span class="tape ${Math.random()>.5?'right':''}"></span>
    <h3>${esc(l.title)}</h3>
    <div class="lmeta">
      <span>✍ ${esc(l.authorNick)}</span><span class="chip">${esc(l.sub)}</span>
      ${g?`<span class="chip" style="background:#e2ecf7;color:#274a63">📒 ${esc(g.name)}</span>`:''}
      <span>${fmtDate(l.ts)}</span>
      ${dueText?`<span class="chip due warn">⏰ ${esc(dueText)}</span>`:(done?'':'<span class="chip due">активно</span>')}
      ${done?'<span class="chip done">✓ выполнено</span>':''}
    </div>
    <div class="lbody${cached?'':' spin'}" id="${elId}">${cached?esc(l._body):'Загрузка…'}</div>
    <div class="lfoot">
      <button class="btn tiny ${done?'ghost':'sun'}" onclick="toggleDone('${l.id}')">${done?'↺ Снять отметку':'✓ Выполнено'}</button>
      ${canEdit?`<button class="btn tiny ghost" onclick="openEditHw('${l.id}')">✏️ Править</button>
      <button class="btn tiny ghost" onclick="delLesson('${l.id}')">🗑 Удалить</button>`:''}
      <div class="lreactions">${reactionBarHTML(l)}</div>
    </div>
  </article>`;
}
/* Точечное обновление после «Выполнено» / «Снять отметку»: без render(), чтобы
   страница не гасла и не «перезагружалась». Правим кнопку, чипы на карточках
   этого урока, счётчики на главной и блок «Не выполнено». */
function applyDoneUI(l, delta){
  const done = l.doneBy.includes(S.ses.uid);
  document.querySelectorAll('article.lesson[data-lid="'+l.id+'"]').forEach(card=>{
    const btn = card.querySelector('.lfoot .btn');
    if(btn){
      btn.textContent = done ? '↺ Снять отметку' : '✓ Выполнено';
      btn.className = 'btn tiny ' + (done ? 'ghost' : 'sun');
    }
    const meta = card.querySelector('.lmeta');
    if(!meta) return;
    let chip = meta.querySelector('.chip.done');
    if(done){
      if(!chip){ chip=document.createElement('span'); chip.className='chip done'; meta.appendChild(chip); }
      chip.textContent = '✓ выполнено';
    } else if(chip){
      chip.remove();
    }
    /* чип «активно» есть только у карточек без срока («Свежие ДЗ») */
    if(!meta.querySelector('.chip.due.warn')){
      let act = meta.querySelector('.chip.due');
      if(!done && !act){
        act = document.createElement('span'); act.className='chip due'; act.textContent='активно';
        meta.appendChild(act);
      } else if(done && act){
        act.remove();
      }
    }
  });

  if(S.stats){
    S.stats.myDone = Math.max(0, (S.stats.myDone||0) + delta);
    S.stats.myUndone = Math.max(0, (S.stats.myUndone||0) - delta);
  }
  const st = document.querySelector('.stats');
  if(st && S.stats){
    const b = st.querySelectorAll('.stat b');
    const dn = S.stats.myDone||0, un = S.stats.myUndone||0;
    if(b[1]) b[1].textContent = un;
    if(b[2]) b[2].textContent = dn;
    if(b[3]) b[3].textContent = (dn+un>0 ? Math.round(dn/(dn+un)*100) : 0) + '%';
  }

  const box = document.getElementById('home-undone');
  if(box){
    box.innerHTML = homeUndoneHTML();
    if(typeof hydrate==='function') hydrate();   // расшифрует только новые карточки (остальное из кеша)
  }
}

const FOOT = `
<footer class="sitefoot">
  <p>Сайт «Дневник» — независимый некоммерческий проект. Он не относится ни к какому учебному заведению,
     организации или ведомству и не является официальным сервисом какой-либо школы.
     Все совпадения названий случайны.</p>
  <p class="rights">Amore/ALC — все права защищены © 2026</p>
</footer>`;
const shell = content => {
  return `
 <header class="topbar" style="display:flex;align-items:center;justify-content:center;position:relative;">
 <a class="brand" href="#/" style="position:absolute;left:14px;">📗 Дневник <small>уроки</small></a>
 <div class="search-container">
   <span>🔍</span>
   <input id="global-search-input" type="text" placeholder="Поиск группы..."
     onfocus="showSearchDropdown()"
     oninput="handleSearchInput(this.value)"
     onblur="setTimeout(()=>hideSearchDropdown(),200)"
     onkeydown="if(event.key==='Enter'){event.preventDefault();if(SEARCH_TYPE){performGlobalSearch(this.value.replace(/^@/,''),SEARCH_TYPE)}}">
   <div id="search-dropdown">
     <div class="search-item" onclick="searchByType('uuid')">🔢 По коду/UUID</div>
     <div class="search-item" onclick="searchByType('nick')">👤 По @никнейму</div>
   </div>
 </div>
 <div class="userchip" style="position:absolute;right:14px;">
   <a class="uchip-nick" href="https://my.alc1.ru/" title="Профиль Amore">${esc(me()?.nick||'')}</a>${roleBadge(me()?.role)}
   <button class="btn tiny chalk" onclick="logout()" title="Выйти"
    style="width:32px;height:32px;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1;border-style:solid;min-width:auto">⏻</button>
 </div>
 </header>
 <div class="shell">
   <aside class="sidebar">
     <nav class="nav">
       <a href="#/" class="${NAV==='home'?'on':''}">🏠 <span class="nl">Главная</span></a>
       <div class="navfolder">
         <a href="#/groups" class="${NAV==='groups'?'on':''}">📒 <span class="nl">Мои группы</span></a>
         <button type="button" class="navcaret" onclick="toggleNavFolder()" title="Свернуть или развернуть" aria-label="Свернуть или развернуть">${S.navOpen?'▾':'▸'}</button>
       </div>
       <div class="navsub"${S.navOpen?'':' hidden'}>
         ${(S.navGroups||[]).length
            ? (S.navGroups||[]).map(g=>`<a href="#/group?id=${g.id}" class="navsub-item">📄 ${esc(g.name)}</a>`).join('')
            : '<span class="navsub-empty">пока нет групп</span>'}
       </div>
       ${me()?.role==='owner'?`<a href="#/admin" class="${NAV==='admin'?'on':''}">👑 <span class="nl">Админ</span></a>`:''}
       <a href="#/profile" class="${NAV==='profile'?'on':''}">👤 <span class="nl">Профиль</span></a>
     </nav>
   </aside>
   <section class="screen">${content}</section>
 </div>${FOOT}`;
};
/* баннер уведомлений (заявки на ссылки, одобрения) */
function notifsBanner(){
  const list=S.notifs||[];
  if(!list.length) return '';
  const close = n => `<button class="notif-x" onclick="markRead('${n.id}')" title="Скрыть" aria-label="Скрыть">✕</button>`;
  return `<div class="notifbar">${list.map(n=>{
    let p={}; try{ p=JSON.parse(n.payload||'{}'); }catch(e){}
    const pre='https://h.alc1.ru/'+(p.kind==='user'?'@':'g')+'/';
    if(n.kind==='new_link_request') return `<div class="notif-row" data-nid="${n.id}">📨 Заявка на ссылку <b>${pre}${esc(p.slug||'')}</b> от <b>${esc(p.from||'')}</b>
      <button class="btn tiny sun" onclick="decideReq('${n.id}',true)">Одобрить</button>
      <button class="btn tiny ghost" onclick="decideReq('${n.id}',false)">Запретить</button>${close(n)}</div>`;
    if(n.kind==='link_approved') return `<div class="notif-row" data-nid="${n.id}">🎉 Ваша ссылка <b>${pre}${esc(p.slug||'')}</b> одобрена
      <button class="btn tiny sun" onclick="applySlug('${esc(p.kind||'group')}','${esc(p.slug||'')}','${esc(p.group_id||'')}')">Назначить</button>
      <button class="btn tiny ghost" onclick="markRead('${n.id}')">Скрыть</button>${close(n)}</div>`;
    if(n.kind==='link_rejected') return `<div class="notif-row" data-nid="${n.id}">🚫 Заявка на ссылку <b>${pre}${esc(p.slug||'')}</b> отклонена
      <button class="btn tiny ghost" onclick="markRead('${n.id}')">Скрыть</button>${close(n)}</div>`;
    return '';
  }).join('')}</div>`;
}

/* «Не выполнено» на главной: список собираем отдельно, чтобы обновлять его
   точечно при отметке ДЗ, не перерисовывая всю страницу. */
function homeUndone(){
  return S.feed.filter(l=>!l.doneBy.includes(S.ses.uid)).map(l=>{
    const g=S.groupMap.get(l.gid);
    const occ=g?hwOccurrence(l,g.schedule||[],new Set(g.cancels||[])):null;
    return {l,occ};
  }).sort((a,b)=>(a.occ?a.occ.date:'9999-99-99').localeCompare(b.occ?b.occ.date:'9999-99-99'));
}
function homeUndoneHTML(){
  const undone=homeUndone();
  return undone.length
    ? undone.map(({l,occ})=>lessonCard(l,S.groupMap.get(l.gid),hwDueText(occ),'u')).join('')
    : `<div class="empty"><div class="hand">Всё выполнено 🎉</div></div>`;
}

function pageHome(){
  NAV='home';
  const today=isoLocal(new Date());
  return notifsBanner()+`
  <div class="pagehead"><h2>Здравствуйте, <span class="hl">${esc(me().nick)}</span></h2>
    <span class="hand">домашка ждёт!</span></div>
  <div class="stats">
    <div class="stat"><b>${S.stats.myGroups??0}</b><span>мои группы</span></div>
    <div class="stat"><b>${S.stats.myUndone??0}</b><span>не выполнено</span></div>
    <div class="stat"><b>${S.stats.myDone??0}</b><span>выполнено</span></div>
    <div class="stat"><b>${(S.stats.myDone??0)+(S.stats.myUndone??0)>0?Math.round((S.stats.myDone??0)/((S.stats.myDone??0)+(S.stats.myUndone??0))*100):0}%</b><span>процент выполнено</span></div>
  </div>
  <h3 style="margin-bottom:6px">⏳ Не выполнено</h3>
  <div id="home-undone">${homeUndoneHTML()}</div>
  <h3 style="margin:26px 0 6px">Свежие ДЗ</h3>
  ${S.feed.map(l=>lessonCard(l,S.groupMap.get(l.gid),null)).join('') ||
  `<div class="empty"><div class="hand">Пока пусто…</div><br>Создайте группу или вступите по коду.</div>`}`;
}

function pageGroups(){
  NAV='groups';
  return notifsBanner()+`
  <div class="pagehead">
    <button class="btn sun" onclick="openCreateGroup()">Новая группа</button>
    <span class="hand">частные · максимум 3</span></div>
  <div class="grid">
    ${S.groups.map(g=>`<div class="gcard paper holes" onclick="go('#/group?id=${g.id}')">
      <span class="tape"></span>
      <h3>${esc(g.name)} ${classChip(g)}</h3>
      <p>${esc(g.school||'')}${g.desc?(' · '+esc(g.desc)):''}</p>
      <div class="gmeta"><span>👥 ${g.memberCount}</span><span>📚 ${g.lessonCount} дз</span>
        <span style="margin-left:auto;font-weight:700">Открыть →</span></div>
    </div>`).join('') || '<div class="empty">У вас пока нет групп.<br>Создайте свою (вы станете куратором) или вступите по коду.</div>'}
  </div>`;
}
function calendarHTML(g){
  const off=S.weekOff||0, days=weekDates(off), today=isoLocal(new Date());
  const hwOn={};
  for(const l of S.lessons){
    const occ=hwOccurrence(l,S.sched,S.cancels);
    if(occ){ const k=occ.date+'|'+occ.row.id; (hwOn[k]=hwOn[k]||[]).push(l); }
  }
  /* Раньше «⋮» стояла у каждого урока и открывала фокус недели. Теперь в
     каждой дате её нет: одна кнопка «⚙ Настроить» справа в строке недели
     (только тем, кто реально может менять уроки). */
  return `
  <div class="calhead">
    <button class="btn tiny chalk" onclick="weekNav(${off-1})">‹ нед.</button>
    <b>${fmtRuDate(isoLocal(days[0]))} — ${fmtRuDate(isoLocal(days[5]))}</b>
    <button class="btn tiny chalk" onclick="weekNav(${off+1})">нед. ›</button>
    ${off!==0?`<button class="btn tiny ghost" onclick="weekNav(0)">сегодня</button>`:''}
    ${(g.canSchedule||g.canTomorrow)?`<button class="btn tiny chalk cal-setup" style="margin-left:auto" onclick="openCalFocus()" title="Настроить неделю" aria-label="Настроить неделю">⚙ Настроить</button>`:''}
  </div>
  <div class="calgrid">
    ${days.map(d=>{
    const date=isoLocal(d), day=d.getDay();
    if(day===0) return `<div class="calcol"><h4>Вс · выходной</h4></div>`;
    const rows=S.sched.filter(r=>+r.day===day).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    return `<div class="calcol ${date===today?'today':''}"><h4>${DAY_NAMES[day-1]} ${fmtRuDate(date)}</h4>
        ${rows.map(r=>{
      const canc=S.cancels.has(date+'|'+r.id), hw=hwOn[date+'|'+r.id];
      return `<div class="calitem ${canc?'cancel':''}" data-cell="${date}|${r.id}">
            <span class="t">${r.start}–${r.finish}</span> ${esc(r.subject)}${r.cab?` <span class="dim">· каб. ${esc(r.cab)}</span>`:''}
            ${canc?'<span class="chip due">ОТМЕНЁН</span>':''}
            ${hw?`<span class="chip done">ДЗ: ${hw.length}</span>`:''}
          </div>`;}).join('') || '<span class="dim" style="font-size:12px">нет уроков</span>'}
      </div>`;}).join('')}
  </div>`;
}
/* Тело активной вкладки группы. Вынесено из pageGroup, чтобы switchGtab()
   перерисовывал только этот блок, а не всю страницу (без «перезагрузки»). */
function groupTabBody(g, tab){
  if(tab==='cal') return `<div id="gcal">${calendarHTML(g)}</div>`;
  if(tab==='audit') return `<div class="paper" style="padding:10px 18px">
      ${S.audit.map(a=>`<div class="auditrow"><span class="when">${fmtDate(a.ts)}</span>
        <b>${esc(a.nick)}</b> <span>${ACTION_LABELS[a.action]||esc(a.action)}</span>
        <span class="dim">${esc(a.details)}</span></div>`).join('') || '<div class="empty">Журнал пуст</div>'}
    </div>`;
  return S.lessons.length ? S.lessons.map(l=>
    lessonCard(l,g,hwDueText(hwOccurrence(l,S.sched,S.cancels)))).join('')
    : '<div class="empty"><div class="hand">ДЗ пока нет</div></div>';
}

function pageGroup(id){
  NAV='groups';
  const g=S.groups.find(x=>x.id===id);
  if(!g) return '<div class="empty">🔒 Группа частная или не существует.</div>';
  const tab=S.gtab||'hw', today=isoLocal(new Date());
  return notifsBanner() + `
  <a class="back" href="#/groups">← Мои группы</a>
  <div class="ghead">
    <div class="row" style="justify-content:space-between">
      <h2>${esc(g.name)} ${classChip(g)}</h2>
      ${g.canManage?`<button class="btn tiny chalk" onclick="openGroupSettings('${g.id}')" title="Настройки группы" aria-label="Настройки группы" style="width:36px;height:36px;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:17px;line-height:1;min-width:auto">⚙</button>`:''}
    </div>
    <p style="color:var(--chalk-dim);margin-top:6px">${esc(g.school||'')}${g.desc?(' · '+esc(g.desc)):''} · 🔒 частная группа</p>
    <div class="row" style="margin-top:14px;gap:18px">
      <span>👥 ${g.memberCount}</span><span>📚 ${S.lessons.length} дз</span>
    </div>
    <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
      <div class="codebox"><span class="dim">код:</span><code>${g.code}</code>
        <button class="btn tiny chalk" onclick="copyText('${g.code}')">⧉</button></div>
      <!-- UUID скрыт: <div class="codebox"><span class="dim">uuid:</span><code>${g.uuid||'—'}</code></div> -->
      ${g.slug?`<div class="codebox"><span class="dim">ссылка:</span><code style="font-size:11px">/g/${esc(g.slug)}</code>
        <button class="btn tiny chalk" onclick="copyText('https://h.alc1.ru/@${esc(g.slug)}')">🔗 приглашение</button></div>`:''}
    </div>
    <div class="row" style="margin-top:14px">
      ${g.canPublish?`<button class="btn sun" onclick="openAddHw('${g.id}')">＋ Добавить ДЗ</button>`:''}
      ${g.canSchedule?`<button class="btn chalk" onclick="openSchedule('${g.id}')">🗓 Расписание</button>`:''}
      <!-- остальное (участники, издатели, ссылка, UUID, удаление) — в ⚙ Настройках -->
    </div>
  </div>
  <!-- полоса ников убрана: участники теперь в меню «Участники» -->
  <div class="nochat">🚫 Сообщения отключены навсегда — это <b>не чат</b>.</div>
  <div class="gtabs">
    <button class="gtab ${tab==='hw'?'on':''}" data-tab="hw" onclick="switchGtab('hw')">📚 Домашки</button>
    <button class="gtab ${tab==='cal'?'on':''}" data-tab="cal" onclick="switchGtab('cal')">🗓 Календарь</button>
    <button class="gtab ${tab==='audit'?'on':''}" data-tab="audit" onclick="switchGtab('audit')">🛡 Аудит</button>
  </div>
  <div id="gtab-body">${groupTabBody(g,tab)}</div>`;
}
function pageAdmin(){
  NAV='admin';
  if(me().role!=='owner') return '<div class="empty">Раздел доступен только Владельцу 👑</div>';
  const sort = S.userSort || {field:'ts', dir:'desc'};
  const sorted = [...S.users].sort((a,b) => {
    let va = a[sort.field], vb = b[sort.field];
    if(sort.field==='ts'){ va=+va; vb=+vb; }
    else { va = String(va||'').toLowerCase(); vb=String(vb||'').toLowerCase(); }
    if(va<vb) return sort.dir==='asc'?-1:1;
    if(va>vb) return sort.dir==='asc'?1:-1;
    return 0;
  });
  const sortIcon = (field) => {
    if(sort.field!==field) return ' ';
    return sort.dir==='asc'?' ↑':' ↓';
  };
  const sortClick = (field) => {
    const dir = (sort.field===field && sort.dir==='asc')?'desc':'asc';
    S.userSort = {field, dir};
    render();
  };
  return notifsBanner()+`
  <div class="pagehead"><h2>Панель Владельца 👑</h2><span class="hand">управление платформой</span></div>
  <div class="stats">
    <div class="stat"><b>${S.stats.users??0}</b><span>аккаунтов</span></div>
    <div class="stat"><b>${S.stats.groups??0}</b><span>групп</span></div>
    <div class="stat"><b>${S.stats.lessons??0}</b><span>дз</span></div>
  </div>
  <div class="paper" style="padding:26px 26px 18px;overflow-x:auto">
    <h3 style="font-size:16px;margin-bottom:12px">Пользователи платформы</h3>
    <p class="dim" style="font-size:13px;margin-bottom:12px">Назначение ролей убрано: первый аккаунт — Владелец, остальные ученики. Группы автономны: куратор сам назначает издателей ДЗ.</p>
    <table class="tbl">
      <thead>
        <tr>
          <th style="cursor:pointer" onclick="sortUsers('nick')">Ник${sortIcon('nick')}</th>
          <!-- почта убрана из проекта: <th style="cursor:pointer" onclick="sortUsers('email')">Email${sortIcon('email')}</th> -->
          <th style="cursor:pointer" onclick="sortUsers('role')">Роль${sortIcon('role')}</th>
          <th style="cursor:pointer" onclick="sortUsers('ts')">Регистрация${sortIcon('ts')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(u=>`
          <tr>
            <td><b class="clickable" onclick="go('#/user?id=${u.id}')">${esc(u.nick)}</b>${u.role==='owner'?' ':''}</td>
            <!-- <td style="font-size:13px">${esc(u.email||'—')}</td> -->
            <td>${roleBadge(u.role)}</td>
            <td style="font-size:12px;color:var(--ink-soft)">${fmtDate(u.ts)}</td>
            <td style="position:relative">
              ${u.role!=='owner' && u.id!==S.ses.uid ? `<button class="btn tiny ghost" onclick="showUserMenu('${u.id}', event)" style="padding:4px 8px;font-size:16px;line-height:1">…</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  <!-- заявки на кастомные ссылки убраны: ссылка назначается сразу -->
  <h3 style="font-size:16px;margin:26px 0 12px">🚩 Жалобы (порог — 5)</h3>
  <div class="paper" style="padding:16px 20px">
    ${(S.reports||[]).length ? S.reports.map(r=>`
      <div class="reqrow ${r.cnt>=5?'hot':''}">
        <span class="avatar mini" onclick="go('#/user?id=${r.id}')">${esc(r.nick[0].toUpperCase())}</span>
        <b class="clickable" onclick="go('#/user?id=${r.id}')">${esc(r.nick)}</b>
        <span class="chip ${r.cnt>=5?'due':'done'}">${r.cnt} жалоб</span>
        <span class="dim">${esc((r.reporters||[]).join(', '))}</span>
      </div>
    `).join('') : '<div class="empty">Жалоб нет</div>'}
  </div>`;
}
function pageProfile(){
  NAV='profile';
  const u=me();
  const done = S.stats.myDone ?? 0;
  const total = done + (S.stats.myUndone ?? 0);
  const kd = total ? (done / total) : 0;
  return notifsBanner()+`
  <div class="pagehead"><h2>Профиль</h2></div>
  <div class="profile paper">
    <div class="avatar">${esc(u.nick[0].toUpperCase())}</div>
    <div style="flex:1;min-width:260px">
      <h3 style="font-size:20px">${esc(u.nick)} ${roleBadge(u.role)}</h3>
      <p class="dim" style="font-size:13px;margin:4px 0 14px">зарегистрирован ${fmtDate(u.ts)}</p>
      <!-- почта убрана из проекта: <div class="prow"><span>Email</span><b>${esc(u.email||'—')}</b></div> -->
      <!-- «Групп (макс. 3)» убрана; КД как в CS: сделано / всего -->
      <div class="prow"><span>КД по ДЗ</span>
        <b>${total ? kd.toFixed(2) : '—'}</b>
        <span class="dim" style="font-size:12px;margin-left:8px">${done} / ${total}</span></div>
      <div class="prow"><span>Кастомная ссылка</span>
        <b>${u.slug?'/@'+esc(u.slug):'<span class="dim">не задана</span>'}</b>
        <button class="btn tiny ghost" onclick="openUserSlug()">Поменять</button></div>
      <div class="row" style="margin-top:18px">
        <button class="btn red" onclick="logout()">⏻ Выйти</button>
        <button class="btn ghost" onclick="logoutFull()">Сменить аккаунт</button>
      </div>
    </div>
  </div>`;
}
function pageUser(){
  NAV='profile';
  const u=S.viewUser;
  if(!u) return '<div class="empty">Профиль не найден</div>';
  return `
  <a class="back" href="#/">← Главная</a>
  <div class="profile paper">
    <div class="avatar">${esc(u.nick[0].toUpperCase())}</div>
    <div style="flex:1;min-width:260px">
      <h3 style="font-size:20px">${esc(u.nick)} ${roleBadge(u.role)}</h3>
      <p class="dim" style="font-size:13px;margin:4px 0 14px">регистрация ${fmtDate(u.ts)}</p>
      <div class="prow"><span>Публичная ссылка</span><b>${u.slug?'/@'+esc(u.slug):'<span class="dim">нет</span>'}</b></div>
      <p class="dim" style="margin-top:18px">Группы и ДЗ видны только их участникам.</p>
    </div>
  </div>
  ${u.id!==S.ses.uid?`<div class="row" style="margin-top:18px">
  <button class="btn ghost" onclick="reportUser('${u.id}')">🚩 Пожаловаться</button></div>`:''}`;
}
function authScreen(){
  S.formOpened=Date.now();
  const tab=S.tab||'login';
  return `
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
      <div class="hand" style="margin-top:auto;padding-top:30px">* максимум 3 группы на участника ↴</div>
      <div class="tray"><i></i><i></i><i></i></div>
    </div>
    <div class="card-auth paper holes">
      <div class="tabs">
        <button class="tab ${tab==='login'?'on':''}" onclick="switchTab('login')">Вход</button>
        <button class="tab ${tab==='reg'?'on':''}" onclick="switchTab('reg')">Регистрация</button>
      </div>
      ${tab==='login'?`
      <form onsubmit="return onLogin(event)" style="padding-top:8px">
        <div class="field"><label>Ник или телефон</label><input id="lg-id" required autocomplete="username"></div>
        <div class="field"><label>Пароль</label><input id="lg-pw" type="password" required></div>
        <button class="btn sun" style="width:100%;margin-top:10px">Войти</button>
      </form>`:`
      <form onsubmit="return onReg(event)" style="padding-top:8px">
        <div class="field"><label>Ник</label><input id="rg-nick" required maxlength="16"></div>
        <div class="field"><label>Номер телефона</label><input id="rg-phone" required inputmode="tel" placeholder="+7 (___) ___-__-__"
          oninput="let d=this.value.replace(/\\D/g,'').replace(/^8/,'7').slice(0,11);this.value=d.length?('+'+d):''"></div>
        <div class="field"><label>Пароль</label><input id="rg-pw" type="password" required oninput="pwStrength(this.value)">
          <div class="pwbar"><i id="pwbar" style="display:block;height:100%"></i></div></div>
        <div class="field"><label>Повторите пароль</label><input id="rg-pw2" type="password" required></div>
        <div class="caprow">
          <canvas id="capCanvas" width="160" height="54"></canvas>
          <button type="button" class="btn tiny ghost" onclick="drawCaptcha()">↻</button>
          <div class="field" style="margin:0;flex:1"><input id="capInput" placeholder="код с доски" autocomplete="off"></div>
        </div>
        <button type="button" class="pow" onclick="runPow(this)">🤖 Проверка «я не робот» (proof-of-work)</button>
        <input class="honey" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn sun" style="width:100%;margin-top:8px">Создать аккаунт</button>
        <p class="tiny-note">Пароль не восстанавливается.</p>
      </form>`}
    </div>
  </div>${FOOT}`;
}
function unlockScreen(){
  return `
  <div class="auth" style="grid-template-columns:1fr;max-width:560px">
    <div class="card-auth paper holes" style="padding:40px 34px">
      <h2 style="font-size:24px;margin:10px 0 6px">С возвращением, ${esc(S.me?.nick||'')} 👋</h2>
      <p class="dim" style="font-size:14px;margin-bottom:16px">Введите пароль, чтобы продолжить.</p>
      <form onsubmit="return unlock(event)">
        <div class="field"><label>Пароль</label><input id="ul-pw" type="password" required autofocus></div>
        <div class="row" style="margin-top:14px"><button class="btn sun">Войти</button>
        <button type="button" class="btn ghost" onclick="logoutFull()">Сменить аккаунт</button></div>
      </form>
    </div>
  </div>${FOOT}`;
}
function stringToColor(s){
  let h=0; for(let i=0;i<(s||'').length;i++){ h=(h*31 + s.charCodeAt(i))|0; }
  const p=['#e5a50a','#2fbf8f','#3a86c8','#ee5a3f','#9b5de5','#00b4d8','#f77f00','#d62828'];
  return p[Math.abs(h)%p.length];
}
function auditHTML(){
  const list=S.audit||[];
  if(!list.length) return '<div class="empty"><div class="hand">Журнал пуст</div></div>';
  let lastDay=''; const y=new Date(); y.setDate(y.getDate()-1);
  const today=isoLocal(new Date()), yest=isoLocal(y);
  const rows=list.map(a=>{
    const d=new Date(a.ts*1000), day=isoLocal(d);
    let div='';
    if(day!==lastDay){ lastDay=day;
      const label= day===today?'Сегодня': day===yest?'Вчера': d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
      div=`<div class="dc-divider"><span>${label}</span></div>`;
    }
    const c=stringToColor(a.user_id);
    return div+`
    <div class="dc-row">
      <span class="avatar mini" style="background:${c}" onclick="go('#/user?id=${a.user_id}')">${esc(a.nick[0].toUpperCase())}</span>
      <div class="dc-body">
        <div class="dc-head"><b style="color:${c}" class="clickable" onclick="go('#/user?id=${a.user_id}')">${esc(a.nick)}</b>
          <span class="dc-time">${d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})} ${d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span></div>
        <div class="dc-text">${ACTION_LABELS[a.action]||esc(a.action)}${a.details?`<br><span class="dc-embed">${esc(a.details)}</span>`:''}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="dcard">${rows}</div>`;
}

/* ========== ГЛОБАЛЬНЫЙ ПОИСК ГРУПП ========== */

let SEARCH_TYPE = null; // 'uuid' или 'nick'
let SEARCH_TIMEOUT = null;

function showSearchDropdown() {
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) {
    dropdown.classList.add('show');
    // Анимация для каждого пункта
    const items = dropdown.querySelectorAll('.search-item');
    items.forEach((item, index) => {
      setTimeout(() => {
        item.classList.add('visible');
      }, 50 + (index * 100));
    });
  }
}

function hideSearchDropdown() {
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) {
    // Сбрасываем анимацию пунктов
    const items = dropdown.querySelectorAll('.search-item');
    items.forEach(item => {
      item.classList.remove('visible');
    });
    dropdown.classList.remove('show');
  }
}

function handleSearchInput(value) {
  if (!value.trim()) {
    // Если пусто, просто показываем dropdown
    showSearchDropdown();
    return;
  }

  // Если ввели @ - автоматически переключаем на поиск по нику
  if (value.startsWith('@') && SEARCH_TYPE !== 'nick') {
    SEARCH_TYPE = 'nick';
    searchByType('nick', value.substring(1));
    return;
  }

  // Если есть значение и выбран тип поиска, выполняем поиск
  if (SEARCH_TYPE && value.trim().length >= 2) {
    clearTimeout(SEARCH_TIMEOUT);
    SEARCH_TIMEOUT = setTimeout(() => {
      performGlobalSearch(value, SEARCH_TYPE);
    }, 500);
  }
}

function searchByType(type, query = '') {
  SEARCH_TYPE = type;
  const input = document.getElementById('global-search-input');
  if (input) {
    if (type === 'nick' && !query.startsWith('@')) {
      input.value = '@' + query;
    } else if (type === 'uuid') {
      input.value = query;
    }
    input.focus();
    hideSearchDropdown();

    if (query.trim()) {
      performGlobalSearch(input.value.replace(/^@/, ''), type);
    }
  }
}

async function performGlobalSearch(query, type) {
  const input = document.getElementById('global-search-input');
  if (!input) return;

  // Показываем загрузку
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) {
    dropdown.innerHTML = '<div class="search-item loading">🔍 Поиск...</div>';
    dropdown.classList.add('show');
    // Показываем элемент загрузки
    const loadingItem = dropdown.querySelector('.search-item');
    if (loadingItem) {
      loadingItem.classList.add('visible');
    }
  }

  try {
    let result;
    if (type === 'uuid') {
      result = await findGroupByCodeOrUuid(query);
    } else {
      result = await findGroupByNick(query);
    }

    if (dropdown) {
      if (result && result.id) {
        let displayName = result.name || 'Группа';
        dropdown.innerHTML = `<div class="search-item success visible">✅Найдена: ${esc(displayName)}</div>`;
        setTimeout(() => {
          hideSearchDropdown();
          input.value = '';
          SEARCH_TYPE = null;
          const body = result.isMember
              ? `<p style="margin:12px 0">Вы уже участник этой группы.</p>`
              : (result.code
                  ? `<p style="margin:12px 0">Код: <b>${esc(result.code)}</b></p>`
                  : `<p class="dim" style="font-size:13px;margin:12px 0 8px">Чтобы вступить, нужен код приглашения. Его даёт куратор группы.</p>
                   <input id="join-code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="КОД" style="text-transform:uppercase;letter-spacing:2px">`);
          const action = result.isMember
              ? `closeModal();go('#/group?id=${esc(result.id)}')`
              : `joinBySearchResult('${esc(result.id)}','${esc(result.code || '')}')`;
          openModal(`
              <h3 style="font-size:20px;margin-bottom:6px">Группа найдена 🎯</h3>
              <p class="dim" style="font-size:13px">«${esc(displayName)}»</p>
              ${body}
              <div class="row" style="margin-top:16px">
                <button class="btn sun" onclick="${action}">${result.isMember ? 'Открыть' : 'Вступить'}</button>
                <button class="btn ghost" onclick="closeModal()">Отмена</button>
              </div>
          `);
        }, 500);
      } else {
        // Группа не найдена
        const errorMessage = type === 'uuid' ? '❌ Группа не найдена с таким кодом/UUID' : '❌ Пользователь не найден или у него нет групп';
        dropdown.innerHTML = `<div class="search-item error visible">${errorMessage}</div>`;
      }
    }
  } catch (e) {
    if (dropdown) {
      dropdown.innerHTML = '<div class="search-item error visible">❌ Ошибка поиска: ' + esc(e.message) + '</div>';
    }
  }
}

async function joinBySearchResult(gid, code) {
  code = String(code || (document.getElementById('join-code') || {}).value || '').trim();
  if (!code) { toast('Введите код приглашения от куратора', 'err'); return; }
  try {
    const r = await API.post('groups?a=join', { code: code.toUpperCase() });
    closeModal();
    go('#/group?id=' + r.group.id);
    toast('Вы в группе «' + esc(r.group.name) + '»', 'ok');
  } catch (err) {
    if (err.message && err.message.includes('уже в этой группе')) {
      closeModal();
      go('#/group?id=' + gid);
      toast('Вы уже в этой группе', 'info');
    } else {
      toast(err.message, 'err');
    }
  }
}

// API функции для поиска
async function findGroupByCodeOrUuid(query) {
  try {
    const res = await API.get('groups?a=search&q=' + encodeURIComponent(query));
    return res.group || null;  // API.get возвращает сам объект, без .data
  } catch (e) { return null; }
}
async function findGroupByNick(query) {
  try {
    const res = await API.get('groups?a=find_by_nick&nick=' + encodeURIComponent(query));
    if (res.groups && res.groups.length > 0) {
      return res.groups[0];
    }
    return null;
  } catch (e) { return null; }
}

/* ─────────── меню пользователя в админке ─────────── */
function showUserMenu(uid, event){
  event.stopPropagation();
  // Удаляем старое меню если есть
  const old = document.getElementById('user-menu-popup');
  if(old) old.remove();

  const menu = document.createElement('div');
  menu.id = 'user-menu-popup';
  menu.style.cssText = `
    position: absolute !important;
    right: 0 !important;
    top: 100% !important;
    margin-top: 4px !important;
    background: #fff !important;
    border: 1px solid #d9cfb4 !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
    z-index: 1000 !important;
    min-width: 180px !important;
    padding: 6px !important;
  `;
  menu.innerHTML = `
    <button class="btn tiny ghost" style="width:100%;justify-content:flex-start;color:#b0341c" 
            onclick="delUser('${uid}'); closeUserMenu();">
      🗑 Удалить пользователя
    </button>
    <button class="btn tiny ghost" style="width:100%;justify-content:flex-start;margin-top:4px" 
            onclick="go('#/user?id=${uid}'); closeUserMenu();">
      👤 Открыть профиль
    </button>
  `;

  // Находим родительскую ячейку td и делаем её position:relative
  const td = event.target.closest('td');
  if(td) td.style.position = 'relative';
  td.appendChild(menu);

  // Закрываем при клике вне меню
  setTimeout(() => {
    document.addEventListener('click', closeUserMenu, {once:true});
  }, 0);
}

function closeUserMenu(){
  const menu = document.getElementById('user-menu-popup');
  if(menu) menu.remove();
}

async function delUser(uid){
  if(!confirm('Удалить пользователя? Все его группы и ДЗ будут удалены.')) return;
  try{
    await API.post('admin?a=del-user', {uid});
    S.users = S.users.filter(u => u.id !== uid);
    render();
    toast('Пользователь удалён', 'ok');
  }catch(err){
    toast(err.message, 'err');
  }
}

function sortUsers(field){
  const sort = S.userSort || {field:'ts', dir:'desc'};
  const dir = (sort.field===field && sort.dir==='asc') ? 'desc' : 'asc';
  S.userSort = {field, dir};
  render();
}