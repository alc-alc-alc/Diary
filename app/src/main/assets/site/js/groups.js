/* ═══════════ groups.js ═══════════
   Визард создания (название → детали → расписание по дням → ссылка),
   вход/поиск, расписание-вкладки, ДЗ, издатели, отмены, ссылки, уведомления. */

/* ─────────── визард создания группы ─────────── */
function openCreateGroup(){
  S.wizard={step:1,name:'',cls:'',letter:'',school:'',desc:'',slug:''};
  openModal(wizardHTML());
}
function wizardHTML(){
  const w=S.wizard;
  if(w.step===1) return `
    <div class="wz">
      <h3 class="wz-title">Давайте назовём группу</h3>
      <p class="wz-sub">Шаг 1 из 4 · длина любая, названия могут совпадать — группы различаются по UUID.</p>
      <div class="field"><input id="wz-name" maxlength="120" autofocus placeholder="Например: Математический кружок" value="${esc(w.name)}"></div>
      <div class="wz-foot">
        <button class="btn ghost" onclick="closeModal()">Отмена</button>
        <button class="btn sun" onclick="wzNext()">Далее →</button>
      </div>
    </div>`;
  if(w.step===2) return `
    <div class="wz">
      <h3 class="wz-title">Немного деталей</h3>
      <p class="wz-sub">Шаг 2 из 4 · класс, буква и школа — необязательно.</p>
      <div style="display:grid;grid-template-columns:1fr 90px;gap:12px">
        <div class="field"><label>Класс</label><input id="wz-class" value="${esc(w.cls)}" placeholder="8"></div>
        <div class="field"><label>Буква</label><input id="wz-letter" value="${esc(w.letter)}" maxlength="2" placeholder="Б"></div>
      </div>
      <div class="field"><label>Школа</label><input id="wz-school" value="${esc(w.school)}" placeholder="МБОУ СОШ №42"></div>
      <div class="field"><label>Описание</label><textarea id="wz-desc" maxlength="200">${esc(w.desc)}</textarea></div>
      <div class="wz-foot">
        <button class="btn ghost" onclick="wzBack()">← Назад</button>
        <button class="btn sun" onclick="wzNext()">К расписанию →</button>
      </div>
    </div>`;
  /* шаг 3 = редактор расписания (отдельный экран), шаг 4 = ссылка */
  return `
    <div class="wz">
      <h3 class="wz-title">Красивая ссылка?</h3>
      <p class="wz-sub">Шаг 4 из 4 · можно пропустить. Владелец платформы рассмотрит заявку; после одобрения ссылка назначается навсегда.</p>
      <div class="field"><label>Ссылка группы</label>
        <div class="slugrow"><span>h.alc1.ru/</span><input id="wz-slug" value="${esc(w.slug)}" placeholder="math-club-8b"></div>
      </div>
      <div class="wz-foot">
        <button class="btn ghost" onclick="wzBack()">← Назад</button>
        <button class="btn ghost" onclick="wzFinish(true)">Пропустить</button>
        <button class="btn sun" onclick="wzFinish(false)">Создать группу</button>
      </div>
    </div>`;
}
function wzNext(){
  const w=S.wizard;
  if(w.step===1){ w.name=$('#wz-name').value.trim(); if(!w.name) return toast('Введите название','err'); w.step=2; openModal(wizardHTML()); return; }
  if(w.step===2){
    w.cls=$('#wz-class').value.trim(); w.letter=$('#wz-letter').value.trim();
    w.school=$('#wz-school').value.trim(); w.desc=$('#wz-desc').value.trim();
    w.step=3; openScheduleWizard(false); return;
  }
  if(w.step===3){ w.step=4; openModal(wizardHTML()); return; }   // из футера расписания
}
function wzBack(){
  const w=S.wizard; w.step=Math.max(1,w.step-1);
  if(w.step===3) openScheduleWizard(true); else openModal(wizardHTML());
}
async function wzFinish(skipSlug){
  const w=S.wizard;
  if(!skipSlug) w.slug=($('#wz-slug')?$('#wz-slug').value:'').trim();
  try{
    const r=await API.post('groups?a=create',
      {name:w.name,class:w.cls,letter:w.letter,school:w.school,desc:w.desc});
    const rows=collectSchedRows();
    if(rows.length) await API.post('schedule?a=save',{gid:r.group.id,rows});
    S.navLoaded=false;
    closeModal(); go('#/group?id='+r.group.id);
    toast('Группа создана. Код: <b>'+r.group.code+'</b>','ok');
    if(w.slug){
      try{
        await API.post('customlink?a=request',{kind:'group',gid:r.group.id,slug:w.slug});
        toast('🎯 Ссылка <b>/g/'+esc(w.slug)+'</b> назначена','ok');
      }catch(e2){ toast(e2.message,'err'); }
    }
  }catch(err){ toast(err.message,'err'); }
}

/* ─────────── расписание: вкладки дней + карточки уроков ─────────── */
function blankRows(d){ return Array.from({length:5},(_,i)=>({day:d,slot:i+1,subject:'',start:'',finish:'',cab:''})); }
function openScheduleWizard(keep){
  S.schedMode='wizard'; S.schedGid=null;
  if(!keep){
    S.schedDays=[1,2,3,4,5,6];
    S.schedData={}; for(let d=1;d<=7;d++) S.schedData[d]=blankRows(d);
    S.schedTab=1;
  }
  openModal(scheduleHTML());
}
function openSchedule(gid){
  S.schedMode='edit'; S.schedGid=gid;
  S.schedDays=[1,2,3,4,5,6];
  S.schedData={};
  for(let d=1;d<=7;d++){
    const rows=(S.sched||[]).filter(r=>+r.day===d).sort((a,b)=>a.slot-b.slot)
      .map(r=>({day:d,slot:+r.slot,subject:r.subject,start:r.start,finish:r.finish,cab:r.cab||''}));
    if(rows.length){ if(d===7) S.schedDays.push(7); S.schedData[d]=rows; }
    else S.schedData[d]=S.schedData[d]||blankRows(d);
  }
  S.schedTab=S.schedDays[0];
  openModal(scheduleHTML());
}
function filledCount(d){ return (S.schedData[d]||[]).filter(r=>r.subject.trim()&&r.start&&r.finish).length; }
function scheduleHTML(){
  const d=S.schedTab;
  return `
  <div class="schedwrap">
    <h3 class="wz-title">Расписание 🗓</h3>
    <p class="wz-sub">${S.schedMode==='wizard'?'Шаг 3 из 4 · ':''}Выбирайте день вкладками и заполняйте уроки по порядку. Заполните последний — появится следующий (до 10).</p>
    ${S.schedMode==='edit'?schedAutoPanel():''}
    <div class="daytabs">${S.schedDays.map(x=>{
      const n=filledCount(x);
      return `<button class="daytab ${x===d?'on':''}" onclick="schedTab(${x})">
        <b>${DAY_NAMES[x-1]}</b>${n?`<i>${n}</i>`:''}</button>`;
    }).join('')}</div>
    <div id="slotlist" class="slotlist">${(S.schedData[d]||[]).map((r,i)=>slotCardHTML(d,i)).join('')}</div>
    <button class="btn ghost" style="margin-top:12px" onclick="addSlot(${d})">＋ Добавить урок (${(S.schedData[d]||[]).length}/10)</button>
    <div class="wz-foot">
      ${S.schedMode==='wizard'
        ?`<button class="btn ghost" onclick="wzBack()">← Назад</button>
          <button class="btn sun" onclick="wzNext()">Завершить расписание →</button>`
        :`<button class="btn ghost" onclick="closeModal()">Закрыть</button>
          <button class="btn sun" onclick="saveSchedule('${S.schedGid}')">✓ Сохранить</button>`}
      ${S.schedDays.length<7?`<button class="btn chalk2" onclick="add7day()">＋ Добавить 7-й день (Вс)</button>`:''}
    </div>
  </div>`;
}
function slotCardHTML(d,i){
  const r=S.schedData[d][i];
  return `
  <div class="slotcard">
    <div class="slotnum">${i+1}</div>
    <div class="slottime">
      <input type="time" value="${esc(r.start||'')}" oninput="slotIn(${d},${i},'start',this)">
      <span class="dash">—</span>
      <input type="time" value="${esc(r.finish||'')}" oninput="slotIn(${d},${i},'finish',this)">
    </div>
    <input class="slotsubj" value="${esc(r.subject)}" placeholder="Предмет" oninput="slotIn(${d},${i},'subject',this)">
    <input class="slotcab" value="${esc(r.cab||'')}" placeholder="Каб." oninput="slotIn(${d},${i},'cab',this)">
    <button class="slotdel" title="Убрать слот" onclick="delSlot(${d},${i})">✕</button>
  </div>`;
}
function schedTab(d){ S.schedTab=d; openModal(scheduleHTML()); }
function add7day(){
  if(!S.schedDays.includes(7)) S.schedDays.push(7);
  if(!S.schedData[7]) S.schedData[7]=blankRows(7);
  S.schedTab=7; openModal(scheduleHTML());
}
function slotIn(d,i,k,inp){
  S.schedData[d][i][k]=inp.value;
  if(k==='subject' && inp.value.trim() && i===S.schedData[d].length-1 && S.schedData[d].length<10){
    S.schedData[d].push({day:d,slot:S.schedData[d].length+1,subject:'',start:'',finish:'',cab:''});
    refreshSlots(d);
  }
}
function refreshSlots(d){
  const el=$('#slotlist'); if(!el) return;
  el.innerHTML=S.schedData[d].map((r,i)=>slotCardHTML(d,i)).join('');
}
function addSlot(d){
  if(S.schedData[d].length>=10) return toast('Максимум 10 уроков в день','info');
  S.schedData[d].push({day:d,slot:S.schedData[d].length+1,subject:'',start:'',finish:'',cab:''});
  refreshSlots(d);
}
function delSlot(d,i){
  S.schedData[d].splice(i,1);
  if(!S.schedData[d].length) S.schedData[d]=blankRows(d);
  refreshSlots(d);
}
function collectSchedRows(){
  const rows=[];
  for(const d of Object.keys(S.schedData||{}).map(Number)){
    let slot=0;
    for(const r of S.schedData[d]){
      if(!r.subject.trim()||!r.start||!r.finish) continue;
      rows.push({day:d,slot:++slot,subject:r.subject.trim(),start:r.start,finish:r.finish,cab:(r.cab||'').trim()});
    }
  }
  return rows;
}
async function saveSchedule(gid){
  try{
    const r=await API.post('schedule?a=save',{gid,rows:collectSchedRows()});
    closeModal(); render();
    toast('Расписание сохранено: '+r.saved+' урок.','ok');
  }catch(err){ toast(err.message,'err'); }
}

/* ─────────── вход по коду и поиск ─────────── */
async function joinGroup(e){
  e.preventDefault();
  try{
    const r=await API.post('groups?a=join',{code:$('#join-code').value.trim().toUpperCase()});
    S.navLoaded=false;
    go('#/group?id='+r.group.id);
    toast('Вы в группе «'+esc(r.group.name)+'»','ok');
  }catch(err){ toast(err.message,'err'); }
  return false;
}
async function searchGroup(e){
  e.preventDefault();
  try{
    const r=await API.get('groups?a=search&q='+encodeURIComponent($('#search-q').value.trim()));
    if(!r.group){ toast('Не найдено: проверьте UUID, код или ссылку','info'); return false; }
    go('#/group?id='+r.group.id);
  }catch(err){ toast(err.message,'err'); }
  return false;
}

/* ─────────── отмены уроков ───────────
   Раньше отмена звала render(): страница гасла, календарь перерисовывался
   целиком и прыгал скролл. Теперь ячейка меняется сразу (оптимистично),
   перерисовывается только календарь, а при ошибке всё откатывается. */
function paintCalendar(gid, cellKey, animate){
  const g=_groupById(gid);
  const box=document.getElementById('gcal');
  if(!g || !box) return false;
  box.innerHTML=calendarHTML(g);
  if(animate){
    box.classList.remove('tabin'); void box.offsetWidth; box.classList.add('tabin');
  }
  if(cellKey){
    const cell=box.querySelector('.calitem[data-cell="'+cellKey+'"]');
    if(cell){ cell.classList.add('flash'); setTimeout(()=>cell.classList.remove('flash'), 950); }
  }
  return true;
}
function _setCancelled(gid,date,slotId,on){
  const key=date+'|'+slotId;
  const had=S.cancels.has(key);
  if(on) S.cancels.add(key); else S.cancels.delete(key);
  S.audit=[];                              // журнал перечитаем при открытии вкладки
  if(!paintCalendar(gid,key)) render();    // календарь не на экране — обычная перерисовка
  if(document.getElementById('calfocus')) paintCalFocus();
  return had;
}

/* ─────────── фокус на неделе («⚙ Настроить» в календаре) ───────────
   Фон блюрится, остальные дни гаснут, неделя разворачивается вширь:
   у каждого урока своя кнопка «Отменить», в конце строки «+»,
   уроки можно перетаскивать между днями. */
let _cfEscBound = false;
function _cfEsc(e){ if(e.key === 'Escape') closeCalFocus(); }

function calFocusInner(g){
  const off = S.weekOff || 0, days = weekDates(off);
  const hwOn = {};
  for(const l of (S.lessons || [])){
    const occ = hwOccurrence(l, S.sched, S.cancels);
    if(occ){ const k = occ.date + '|' + occ.row.id; (hwOn[k] = hwOn[k] || []).push(l); }
  }
  const cols = days.map(d=>{
    const date = isoLocal(d), wd = d.getDay();
    /* Воскресенье не участвует в расписании: его колонку занимает панель управления.
       Ученикам, которым нечего настраивать, оставляем прежний «выходной». */
    if(wd === 0) return (g.canSchedule || g.canTomorrow)
      ? `<div class="cf-side" data-trash="${g.canSchedule ? '1' : '0'}"
           ondragover="cpDragOver(event)" ondragleave="cpDragLeave(event)" ondrop="cpDrop(event)">${cpHTML(g)}</div>`
      : `<div class="cf-day"><h4>Вс · выходной</h4></div>`;
    const rows = (S.sched || []).filter(r=>+r.day===wd)
      .sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    const items = rows.map(r=>{
      const canc = S.cancels.has(date + '|' + r.id), hw = hwOn[date + '|' + r.id];
      /* Кабинет правится прямо здесь: клик по «каб. …» превращает его в поле.
         Кабинет — свойство слота, поэтому изменение действует на все недели. */
      const cab = g.canSchedule
        ? `<button class="cf-cab" data-gid="${g.id}" data-slot="${r.id}" data-cab="${esc(r.cab||'')}"
             onclick="editCab(event,this)" title="Изменить кабинет (${esc(r.cab||'не задан')})">каб. ${r.cab?esc(r.cab):'—'}</button>`
        : (r.cab ? `каб. ${esc(r.cab)}` : '');
      /* Бывшие большие «Отменить/Вернуть» — теперь компактная иконка в углу. */
      const act = g.canTomorrow
        ? `<button class="cf-act" onclick="event.stopPropagation();${canc?'uncancelSlot':'cancelSlot'}('${g.id}','${date}','${r.id}',${off})"
             title="${canc?'Вернуть урок':'Отменить урок'}" aria-label="${canc?'Вернуть урок':'Отменить урок'}">${canc?'↺':'✕'}</button>`
        : '';
      return `<div class="cf-item${canc?' cancel':''}" ${g.canSchedule?'draggable="true"':''}
          ondragstart="cfDragStart(event,'${r.id}')" ondragend="cfDragEnd(event)"
          data-slot="${r.id}" data-date="${date}">
        <div class="cf-top"><span class="t">${r.start}–${r.finish}</span>${act}</div>
        <div class="sub">${esc(r.subject)}${cab?` · ${cab}`:''}</div>
        ${canc?'<span class="cf-chip canc">отменён</span>':''}
        ${hw?`<span class="cf-chip hw">ДЗ: ${hw.length}</span>`:''}
      </div>`;
    }).join('') || '<div class="cf-empty">нет уроков</div>';
    return `<div class="cf-day" data-day="${wd}"
        ondragover="cfDragOver(event)" ondragleave="cfDragLeave(event)"
        ondrop="cfDrop(event,'${g.id}',${wd})">
      <h4>${DAY_NAMES[wd-1]} ${fmtRuDate(date)}</h4>${items}</div>`;
  }).join('');
  return `
    <div class="cf-notifs">${typeof notifsBanner === 'function' ? notifsBanner() : ''}</div>
    <div class="cf-head">
      <div class="cf-title">${fmtRuDate(isoLocal(days[0]))} — ${fmtRuDate(isoLocal(days[5]))}
        <span class="cf-hint">уроки можно перетаскивать между днями</span></div>
      <button class="cf-close" onclick="closeCalFocus()" aria-label="Закрыть">✕</button>
    </div>
    <div class="cf-row">${cols}</div>`;
}
function openCalFocus(date, slotId){
  const g = _groupById(qp('id')); if(!g) return;
  closeCalFocus(true);
  const el = document.createElement('div');
  el.id = 'calfocus'; el.className = 'calfocus';
  el.innerHTML = `<div class="cf-panel">${calFocusInner(g)}</div>`;
  document.body.appendChild(el);
  document.body.classList.add('calfocus-open');
  void el.offsetWidth;                       // чтобы transition сработал
  el.classList.add('on');
  el.addEventListener('click', e=>{ if(e.target === el) closeCalFocus(); });
  if(!_cfEscBound){ document.addEventListener('keydown', _cfEsc); _cfEscBound = true; }
}
function closeCalFocus(instant){
  const el = document.getElementById('calfocus');
  document.body.classList.remove('calfocus-open');
  if(_cfEscBound){ document.removeEventListener('keydown', _cfEsc); _cfEscBound = false; }
  if(!el) return;
  el.classList.remove('on');
  if(instant) el.remove(); else setTimeout(()=>el.remove(), 280);
}
function paintCalFocus(){
  const box = document.getElementById('calfocus'); if(!box) return;
  const g = _groupById(qp('id')); if(!g) return;
  const panel = box.querySelector('.cf-panel');
  if(panel) panel.innerHTML = calFocusInner(g);
}
function calFocusAdd(gid){
  closeCalFocus(true);
  openSchedule(gid);
}

/* ─────────── панель управления вместо колонки «Вс» ───────────
   Папка «Блоки» — палитра заготовок: «＋» открывает список уроков, выбранный
   становится блоком; блок перетаскивается в день, урок добавляется в конец дня
   (schedule?a=add). Блоки живут только в этой вкладке (S.blocks по группам). */
function blocksOf(gid){
  S.blocks = S.blocks || {};
  return (S.blocks[gid] = S.blocks[gid] || []);
}
function blockDur(r){
  const m = t => { const x = String(t||'').match(/(\d{1,2})[:.](\d{2})/); return x ? (+x[1])*60 + (+x[2]) : null; };
  const a = m(r.start), b = m(r.finish);
  return (a != null && b != null && b > a) ? (b - a) : 45;
}
function blocksHTML(gid){
  const arr = blocksOf(gid);
  if(!arr.length) return '<div class="cp-empty">пусто — нажмите +</div>';
  return arr.map((b,i)=>`<div class="cp-block" draggable="true"
      ondragstart="blockDragStart(event,${i})" ondragend="blockDragEnd(event)"
      title="Перетащите в день — урок встанет в конец дня">
      <b>${esc(b.subject)}</b>
      <span>${b.cab?'каб. '+esc(b.cab)+' · ':''}${b.dur} мин</span>
      <button class="cp-x" onclick="event.stopPropagation();blockRemove(${i})" title="Убрать" aria-label="Убрать блок">✕</button>
    </div>`).join('');
}
function cpHTML(g){
  return `
    <h4 class="cp-title">Панель</h4>
    <div class="cp-folder">
      <div class="cp-folder-head">
        <span class="cp-folder-name">Блоки</span>
        ${g.canSchedule?`<button class="cp-add" onclick="openBlockMenu('${g.id}')" title="Добавить урок в блоки" aria-label="Добавить урок в блоки">+</button>`:''}
      </div>
      <div id="cp-blocks" class="cp-blocks">${blocksHTML(g.id)}</div>
    </div>
    <div class="cp-trash">Отпустите,<br>чтобы удалить</div>
    <div class="cp-actions">
      ${g.canTomorrow?`<button class="cp-act" onclick="cancelWeek('${g.id}')">Отменить неделю</button>
      <button class="cp-act" onclick="restoreWeek('${g.id}')">Вернуть всё</button>`:''}
      ${g.canSchedule?`<button class="cp-act" onclick="calFocusAdd('${g.id}')">Расписание…</button>`:''}
    </div>`;
}
function renderBlocks(){
  const box = document.getElementById('cp-blocks'); if(!box) return;
  box.innerHTML = blocksHTML(qp('id'));
}
function openBlockMenu(gid){
  const seen = new Map();
  for(const r of (S.sched || [])){
    const sub = String(r.subject || '').trim(); if(!sub) continue;
    const key = sub.toLowerCase() + '|' + String(r.cab || '').trim();
    if(!seen.has(key)) seen.set(key, {subject: sub, cab: String(r.cab || '').trim(), dur: blockDur(r)});
  }
  S.blockPick = [...seen.values()];
  if(!S.blockPick.length) return toast('Сначала задайте расписание', 'err');
  openModal(`
    <h3 style="font-size:20px;margin-bottom:6px">Какой урок добавить?</h3>
    <p class="dim" style="font-size:13px">Урок появится в папке «Блоки» — перетащите его в нужный день.</p>
    <div class="blockmenu" style="margin-top:12px">
      ${S.blockPick.map((b,i)=>`<button class="blockpick" onclick="addBlockPick(${i})">
        <b>${esc(b.subject)}</b><span>${b.cab?'каб. '+esc(b.cab)+' · ':''}${b.dur} мин</span></button>`).join('')}
    </div>
    <div class="row" style="margin-top:16px"><button class="btn ghost" onclick="closeModal()">Отмена</button></div>`);
}
function addBlockPick(i){
  const b = (S.blockPick || [])[i]; if(!b) return;
  blocksOf(qp('id')).push({subject: b.subject, cab: b.cab || '', dur: b.dur || 45});
  closeModal(); renderBlocks();
  toast('Блок: ' + esc(b.subject), 'ok');
}
function blockRemove(i){
  const arr = blocksOf(qp('id'));
  arr.splice(i, 1); renderBlocks();
}
function blockDragStart(e, i){
  CF_BLOCK = i;
  try{
    e.dataTransfer.setData('application/x-block', String(i));
    e.dataTransfer.effectAllowed = 'copy';
    const c = document.createElement('canvas'); c.width = c.height = 1;
    e.dataTransfer.setDragImage(c, 0, 0);
  }catch(err){}
  e.currentTarget.classList.add('drag');
}
function blockDragEnd(){
  CF_BLOCK = null;
  document.querySelectorAll('.cp-block.drag').forEach(d=>d.classList.remove('drag'));
  document.querySelectorAll('.cf-day.over').forEach(d=>d.classList.remove('over'));
  clearCfGhost();
}
/* ── удаление перетаскиванием на панель ──
   Тащим карточку урока на панель — она подсвечивается «Отпустите, чтобы удалить»,
   бросок удаляет урок из расписания (schedule?a=del). */
function cpDragOver(e){
  const panel = e.currentTarget;
  if(panel.dataset.trash !== '1' || !CF_DRAG) return;
  e.preventDefault();
  try{ e.dataTransfer.dropEffect = 'move'; }catch(err){}
  panel.classList.add('trash-over');
}
function cpDragLeave(e){
  if(e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('trash-over');
}
function cpDrop(e){
  const panel = e.currentTarget;
  panel.classList.remove('trash-over');
  if(panel.dataset.trash !== '1' || !CF_DRAG) return;
  e.preventDefault();
  const sid = CF_DRAG;
  CF_DRAG = null;
  trashLesson(sid);
}
async function trashLesson(sid){
  const gid = qp('id');
  const row = (S.sched || []).find(r => r.id === sid);
  const day = row ? +row.day : null;
  try{
    const res = await API.post('schedule?a=del', {gid, id: sid});
    if(res && res.rows && day != null)
      S.sched = (S.sched || []).filter(r => +r.day !== day).concat(res.rows);
    toast(row ? ('Урок удалён: ' + esc(row.subject)) : 'Урок удалён', 'info');
  }catch(err){ toast(err.message, 'err'); }
  paintCalFocus(); paintCalendar(gid);
}

async function blockDrop(gid, day, i){
  const b = blocksOf(gid)[i]; if(!b) return;
  try{
    const res = await API.post('schedule?a=add', {gid, day, subject: b.subject, cab: b.cab || '', dur: b.dur || 45});
    if(res && res.rows) S.sched = (S.sched || []).filter(r=>+r.day !== day).concat(res.rows);
    toast('Урок добавлен: ' + esc(b.subject), 'ok');
  }catch(err){ toast(err.message, 'err'); }
  paintCalFocus(); paintCalendar(gid);
}

/* массовые отмены недели (пн–сб) из панели */
function weekPairs(onlyCancelled){
  const days = weekDates(S.weekOff || 0), out = [];
  for(const d of days){
    const wd = d.getDay(); if(wd === 0) continue;
    const date = isoLocal(d);
    for(const r of (S.sched || [])){
      if(+r.day !== wd) continue;
      const has = S.cancels.has(date + '|' + r.id);
      if(onlyCancelled === has) out.push([date, r.id]);
    }
  }
  return out;
}
async function cancelWeek(gid){
  const pairs = weekPairs(false);
  if(!pairs.length) return toast('На этой неделе нет уроков', 'info');
  pairs.forEach(([date,id])=>S.cancels.add(date + '|' + id));
  S.audit = [];
  paintCalFocus(); paintCalendar(gid);
  const res = await Promise.allSettled(pairs.map(([date,id])=>API.post('schedule?a=cancel',{gid,date,slot:id})));
  const bad = res.filter(x=>x.status === 'rejected');
  if(bad.length) toast((bad[0].reason && bad[0].reason.message) || 'Не всё отменилось', 'err');
  else toast('Неделя отменена: ' + pairs.length, 'info');
}
async function restoreWeek(gid){
  const pairs = weekPairs(true);
  if(!pairs.length) return toast('Отмен на этой неделе нет', 'info');
  pairs.forEach(([date,id])=>S.cancels.delete(date + '|' + id));
  S.audit = [];
  paintCalFocus(); paintCalendar(gid);
  const res = await Promise.allSettled(pairs.map(([date,id])=>API.post('schedule?a=uncancel',{gid,date,slot:id})));
  const bad = res.filter(x=>x.status === 'rejected');
  if(bad.length) toast((bad[0].reason && bad[0].reason.message) || 'Не всё вернулось', 'err');
  else toast('Отмены сняты: ' + pairs.length, 'info');
}

/* ── быстрая правка кабинета в карточке урока ──
   Клик по «каб. …» меняет подпись на инлайн-поле: Enter/blur — сохранить,
   Esc — отмена. Кабинет — свойство слота расписания (на все недели). */
function editCab(e, btn){
  e.preventDefault(); e.stopPropagation();
  const item = btn.closest('.cf-item');
  const gid = btn.dataset.gid, slot = btn.dataset.slot, cur = btn.dataset.cab || '';
  const inp = document.createElement('input');
  inp.className = 'cf-cab-inp';
  inp.value = cur; inp.maxLength = 16; inp.placeholder = 'каб.';
  inp.size = 7;
  item.draggable = false;              // пока правим — карточку не тащим
  btn.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = async (save) => {
    if(done) return; done = true;
    const v = inp.value.trim().slice(0, 16);
    if(!save || v === cur){ paintCalFocus(); return; }
    try{
      await API.post('schedule?a=cab', {gid, id: slot, cab: v});
      const row = (S.sched || []).find(x => x.id === slot);
      if(row) row.cab = v;
      toast(v ? 'Кабинет: ' + esc(v) : 'Кабинет убран', 'ok');
    }catch(err){ toast(err.message, 'err'); }
    paintCalFocus();
  };
  inp.addEventListener('keydown', ev=>{
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', ()=>finish(true));
  inp.addEventListener('mousedown', ev=>ev.stopPropagation());
  inp.addEventListener('dragstart', ev=>ev.preventDefault());
}

/* drag&drop уроков между днями */
let CF_DRAG = null;
let CF_BLOCK = null;      // индекс блока, который сейчас тащат из панели
let CF_GHOST_DAY = null;
function cfDragStart(e, id){
  CF_DRAG = id;
  try{
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    /* Убираем «летающую» копию карточки: вместо неё показываем аккуратный
       плейсхолдер в столбце, куда урок уедет. */
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    e.dataTransfer.setDragImage(c, 0, 0);
  }catch(err){}
  e.currentTarget.classList.add('drag');
}
function cfDragEnd(){
  CF_DRAG = null;
  clearCfGhost();
  document.querySelectorAll('.cf-day.over').forEach(d=>d.classList.remove('over'));
  document.querySelectorAll('.cf-item.drag').forEach(d=>d.classList.remove('drag'));
  document.querySelectorAll('.cf-side.trash-over').forEach(p=>p.classList.remove('trash-over'));
}
function clearCfGhost(){
  document.querySelectorAll('.cf-ghost').forEach(g=>g.remove());
  CF_GHOST_DAY = null;
}
function cfDropIndex(col, y){
  const items = [...col.querySelectorAll('.cf-item:not(.cf-ghost)')];
  for(let i = 0; i < items.length; i++){
    const r = items[i].getBoundingClientRect();
    if(y < r.top + r.height / 2) return i;
  }
  return items.length;
}
function cfShowGhost(col, idx){
  const key = col.getAttribute('data-day') + ':' + idx;
  if(CF_GHOST_DAY === key) return;
  clearCfGhost();
  CF_GHOST_DAY = key;
  const r = (S.sched || []).find(x=>x.id === CF_DRAG);
  const gh = document.createElement('div');
  gh.className = 'cf-ghost';
  gh.innerHTML = r
    ? `<div class="t">${r.start}–${r.finish}</div><div class="sub">${esc(r.subject)}</div>`
    : 'сюда';
  const items = [...col.querySelectorAll('.cf-item:not(.cf-ghost)')];
  col.insertBefore(gh, items[idx] || null);
}
function cfDragOver(e){
  e.preventDefault();
  try{ e.dataTransfer.dropEffect = CF_BLOCK === null ? 'move' : 'copy'; }catch(err){}
  const col = e.currentTarget;
  col.classList.add('over');
  /* блок из панели «Блоки» просто подсвечивает день — плейсхолдер не нужен */
  if(CF_BLOCK === null) cfShowGhost(col, cfDropIndex(col, e.clientY));
}
function cfDragLeave(e){
  if(e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('over');
  clearCfGhost();
}
function cfDrop(e, gid, day){
  e.preventDefault();
  const col = e.currentTarget;
  if(CF_BLOCK !== null){
    const idxB = CF_BLOCK;
    clearCfGhost();
    document.querySelectorAll('.cf-day.over').forEach(d=>d.classList.remove('over'));
    blockDrop(gid, day, idxB);
    return;
  }
  const idx = cfDropIndex(col, e.clientY);
  const items = [...col.querySelectorAll('.cf-item:not(.cf-ghost)')];
  const before = items[idx] ? items[idx].getAttribute('data-slot') : '';
  const id = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || CF_DRAG;
  clearCfGhost();
  document.querySelectorAll('.cf-day.over').forEach(d=>d.classList.remove('over'));
  if(id) moveSlot(gid, id, day, before);
}
async function moveSlot(gid, sid, day, before){
  try{
    const res = await API.post('schedule?a=move', {gid, id: sid, day, before: before || ''});
    if(res && res.rows){
      const days = new Set(res.rows.map(r=>+r.day));
      S.sched = (S.sched || []).filter(r=>!days.has(+r.day)).concat(res.rows);
    }
  }catch(err){
    toast(err.message, 'err');
  }
  paintCalFocus(); paintCalendar(gid);
}

async function cancelSlot(gid,date,slotId,off){
  S.weekOff=off;
  const had=_setCancelled(gid,date,slotId,true);
  try{
    await API.post('schedule?a=cancel',{gid,date,slot:slotId});
    toast('Урок отменён — ДЗ перенесено на следующий урок предмета','info');
  }catch(err){
    if(!had) _setCancelled(gid,date,slotId,false);
    toast(err.message,'err');
  }
}
async function uncancelSlot(gid,date,slotId,off){
  S.weekOff=off;
  const had=_setCancelled(gid,date,slotId,false);
  try{ await API.post('schedule?a=uncancel',{gid,date,slot:slotId}); }
  catch(err){
    if(had) _setCancelled(gid,date,slotId,true);
    toast(err.message,'err');
  }
}

/* ─────────── ДЗ ─────────── */
function openAddHw(gid){
  const subs=[...new Set((S.sched||[]).map(r=>r.subject))];
  if(!subs.length) return toast('Сначала задайте расписание','err');
  openModal(`
    <h3 style="font-size:20px;margin-bottom:6px">Новое ДЗ 📚</h3>
    <p class="dim" style="font-size:13px">ДЗ привязано к предмету и активно до ближайшего урока этого предмета.</p>
    <form onsubmit="return submitHw(event,'${gid}')">
      <div class="field"><label>Предмет</label><select id="l-sub">${subs.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div>
      <div class="field"><label>Заголовок</label><input id="l-title" maxlength="80" required placeholder="ДЗ №12"></div>
      <div class="field"><label>Задание</label><textarea id="l-text" required placeholder="Упражнение 134…"></textarea></div>
      <div class="row" style="margin-top:16px"><button class="btn sun">Опубликовать</button>
      <button type="button" class="btn ghost" onclick="closeModal()">Отмена</button></div>
    </form>`);
}
async function submitHw(e,gid){
  e.preventDefault();
  try{
    const gk=await API.get('groups?a=key&id='+gid);
    if(!gk.wrapped) throw new Error('Нет ключа группы');
    const key=await decryptWrapped(gk.wrapped);
    const iv=rnd(12);
    const ct=await aesGcmEncrypt(key,iv,enc.encode($('#l-text').value));
    await API.post('lessons?a=add',{gid,title:$('#l-title').value.trim(),sub:$('#l-sub').value,
      iv:b64.fromBuf(iv),ct:b64.fromBuf(ct)});
    closeModal(); render(); toast('ДЗ выложено','key');
  }catch(err){ toast(err.message,'err'); }
  return false;
}
async function openEditHw(lid){
  const l=S.lessons.find(x=>x.id===lid); if(!l) return;
  let text=''; try{ text=await decryptLesson(l)||''; }catch(e){}
  const subs=[...new Set((S.sched||[]).map(r=>r.subject))];
  openModal(`
    <h3 style="font-size:20px;margin-bottom:6px">Правка ДЗ ✏️</h3>
    <p class="dim" style="font-size:13px">Править можно любое ДЗ группы — факт правки попадёт в аудит.</p>
    <form onsubmit="return submitEditHw(event,'${lid}')">
      <div class="field"><label>Предмет</label><select id="e-sub">${subs.map(s=>`<option ${s===l.sub?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="field"><label>Заголовок</label><input id="e-title" maxlength="80" required value="${esc(l.title)}"></div>
      <div class="field"><label>Задание</label><textarea id="e-text" required>${esc(text)}</textarea></div>
      <div class="row" style="margin-top:16px"><button class="btn sun">Сохранить и перешифровать</button>
      <button type="button" class="btn ghost" onclick="closeModal()">Отмена</button></div>
    </form>`);
}
async function submitEditHw(e,lid){
  e.preventDefault();
  const l=S.lessons.find(x=>x.id===lid);
  try{
    const gk=await API.get('groups?a=key&id='+l.gid);
    const key=await decryptWrapped(gk.wrapped);
    const iv=rnd(12);
    const ct=await aesGcmEncrypt(key,iv,enc.encode($('#e-text').value));
    await API.post('lessons?a=edit',{lid,title:$('#e-title').value.trim(),sub:$('#e-sub').value,
      iv:b64.fromBuf(iv),ct:b64.fromBuf(ct)});
    closeModal(); render(); toast('ДЗ исправлено (запись в аудите)','info');
  }catch(err){ toast(err.message,'err'); }
  return false;
}
async function delLesson(lid){
  if(!confirm('Удалить ДЗ?')) return;
  try{ await API.post('lessons?a=del',{lid}); render(); }catch(err){ toast(err.message,'err'); }
}
async function toggleDone(lid){
  /* Раньше: await API.post(...); render(); — вся страница гасла и заново
     подгружалась (ощущение перезагрузки). Теперь отметка применяется сразу,
     точечно правится DOM (applyDoneUI), запрос уходит следом; ошибка — откат. */
  const l = (S.lessons||[]).find(x=>x.id===lid) || (S.feed||[]).find(x=>x.id===lid);
  if(!l || !S.ses || !Array.isArray(l.doneBy)){
    try{ await API.post('lessons?a=done',{lid}); render(); }catch(err){ toast(err.message,'err'); }
    return;
  }
  const wasDone = l.doneBy.includes(S.ses.uid);
  const before = l.doneBy.slice();
  l.doneBy = wasDone ? l.doneBy.filter(x=>x!==S.ses.uid) : [...l.doneBy, S.ses.uid];
  applyDoneUI(l, wasDone ? -1 : +1);
  try{
    await API.post('lessons?a=done',{lid});
  }catch(err){
    l.doneBy = before;
    applyDoneUI(l, wasDone ? +1 : -1);
    toast(err.message,'err');
  }
}

/* ─────────── реакции на ДЗ ───────────
   Одна реакция на пользователя: выбор другой заменяет прежнюю, повторный клик снимает.
   Обновляем только пилюли этого урока; недавние (5) хранятся в localStorage. */
async function setReaction(lid, kind){
  const l = (S.lessons||[]).find(x=>x.id===lid) || (S.feed||[]).find(x=>x.id===lid);
  if(!l) return;
  const before = JSON.parse(JSON.stringify(l.reactions || {}));
  const rs = l.reactions = l.reactions || {};
  const my = myReaction(l);
  if(my === kind){
    const n = Math.max(0, ((rs[kind] || {}).n || 1) - 1);
    if(n) rs[kind] = {n, mine:false}; else delete rs[kind];
  } else {
    if(my){
      const n = Math.max(0, ((rs[my] || {}).n || 1) - 1);
      if(n) rs[my] = {n, mine:false}; else delete rs[my];
    }
    rs[kind] = {n: (((rs[kind] || {}).n) || 0) + 1, mine:true};
  }
  rememberReaction(kind);
  paintReactions(l);
  try{
    const r = await API.post('lessons?a=react', {lid, kind});
    if(r && r.reactions){ l.reactions = r.reactions; paintReactions(l); }
  }catch(err){
    l.reactions = before;
    paintReactions(l);
    toast(err.message,'err');
  }
}
function rememberReaction(kind){
  try{
    const a = recentReactions().filter(k=>k!==kind);
    a.unshift(kind);
    localStorage.setItem('hw_reactions_recent', JSON.stringify(a.slice(0,5)));
  }catch(e){}
}
function paintReactions(l){
  document.querySelectorAll('article.lesson[data-lid="'+l.id+'"] .lreactions').forEach(box=>{
    const open = box.classList.contains('open');
    const full = box.classList.contains('full');
    box.innerHTML = reactionBarHTML(l);
    box.classList.toggle('open', open);
    box.classList.toggle('full', full);
  });
}
function toggleReactPop(btn){
  const box = btn.closest('.lreactions');
  if(box) box.classList.toggle('open');
}
function toggleReactFull(btn){
  const box = btn.closest('.lreactions');
  if(box) box.classList.toggle('full');
}
/* клик мимо — закрываем закреплённое меню реакций */
document.addEventListener('click', e=>{
  if(e.target.closest && e.target.closest('.lreactions')) return;
  document.querySelectorAll('.lreactions.open').forEach(b=>b.classList.remove('open'));
});

/* ─────────── тихий live-опрос ───────────
   Раз в секунду спрашиваем только реакции + «rev». Страница не перерисовывается:
   тихо обновляются чипы реакций. Если пришёл другой rev (новое/изменённое ДЗ) —
   один раз перерисовываем содержимое без анимации и с сохранением скролла. */
const LIVE = {timer:null, rev:null, serverRev:null, busy:false, on:false};

function startLivePoll(){
  if(!S.ses) return;
  LIVE.on = true;
  if(!LIVE.timer && !LIVE.busy) LIVE.timer = setTimeout(liveTick, 1000);
}
function stopLivePoll(){
  LIVE.on = false;
  if(LIVE.timer) clearTimeout(LIVE.timer);
  LIVE.timer = null;
}
function liveIds(){
  const seen = new Set();
  for(const l of (S.feed || [])) seen.add(l.id);
  for(const l of (S.lessons || [])) seen.add(l.id);
  return [...seen].slice(0, 60);
}
async function liveTick(){
  LIVE.timer = null;
  if(!LIVE.on || !S.ses) return;
  if(!document.hidden && !LIVE.busy){
    LIVE.busy = true;
    try{
      const ids = liveIds();
      const q = ids.length ? ('&ids=' + encodeURIComponent(ids.join(','))) : '';
      const r = await API.get('lessons?a=poll' + q);
      applyLive(r);
      await maybeSilentRefresh();
    }catch(e){ /* API перезапускается или сеть моргнула — просто следующий тик */ }
    LIVE.busy = false;
  }
  if(LIVE.on && !LIVE.timer) LIVE.timer = setTimeout(liveTick, 1000);
}
function applyLive(r){
  if(!r) return;
  if(r.reactions){
    const byId = new Map();
    for(const l of (S.feed || [])) byId.set(l.id, l);
    for(const l of (S.lessons || [])) byId.set(l.id, l);
    for(const [lid, next] of Object.entries(r.reactions)){
      const l = byId.get(lid);
      if(!l) continue;
      if(JSON.stringify(next) !== JSON.stringify(l.reactions || {})){
        l.reactions = next;
        paintReactions(l);          // только чипы, ничего больше не трогаем
      }
    }
  }
  if(r.rev) LIVE.serverRev = r.rev;
}
function canSilentRefresh(){
  if(document.querySelector('#modal-root .mcard')) return false;   // не дёргаем под модалкой
  const a = document.activeElement;
  if(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return false;   // не мешаем вводу
  return !SILENT_BUSY;
}
let SILENT_BUSY = false;
async function maybeSilentRefresh(){
  if(LIVE.rev === null){ LIVE.rev = LIVE.serverRev; return; }
  if(!LIVE.serverRev || LIVE.serverRev === LIVE.rev) return;
  if(!canSilentRefresh()) return;                   // попробуем на следующем тике
  SILENT_BUSY = true;
  const y = window.scrollY;
  try{
    await render(null, true);                       // без .swapping → без мигания
    window.scrollTo(0, y);
    LIVE.rev = LIVE.serverRev;
  }catch(e){}
  SILENT_BUSY = false;
}

/* ─────────── люди ─────────── */
function openPublishers(gid){
  const g=S.groups.find(x=>x.id===gid);
  openModal(`
    <h3 style="font-size:20px;margin-bottom:6px">Кто выкладывает ДЗ</h3>
    <p class="dim" style="font-size:13px">Куратор всегда издатель. Назначайте остальных участников.</p>
    <div style="display:grid;gap:8px;margin-top:14px">
      ${g.members.map(m=>`<div class="row" style="justify-content:space-between;background:rgba(255,255,255,.4);border-radius:8px;padding:8px 12px">
        <span>${esc(m.nick)} ${m.id===g.createdBy?'<span class="b cur">куратор</span>':''}</span>
        ${m.id===g.createdBy?'':(S.pubs.includes(m.id)
          ?`<button class="btn tiny ghost" onclick="togglePub('${gid}','${m.id}','remove')">Снять</button>`
          :`<button class="btn tiny sun" onclick="togglePub('${gid}','${m.id}','add')">Назначить</button>`)}
      </div>`).join('')}
    </div>
    <div class="row" style="margin-top:16px"><button class="btn ghost" onclick="closeModal()">Готово</button></div>`);
}
async function togglePub(gid,uid,mode){
  try{
    await API.post('groups?a=publishers',{gid,uid,mode});
    S.pubs=mode==='add'?[...S.pubs,uid]:S.pubs.filter(p=>p!==uid);
    openPublishers(gid); render();
  }catch(err){ toast(err.message,'err'); }
}
async function kickMember(gid,mid){
  if(!confirm('Исключить участника?')) return;
  try{ await API.post('groups?a=kick',{gid,mid}); render(); }catch(err){ toast(err.message,'err'); }
}
async function delGroup(gid,name){
  const g=_groupById(gid); name = name || (g && g.name) || 'группу';
  if(!confirm('Удалить «'+name+'» со всеми ДЗ и расписанием? Это необратимо.')) return;
  try{ await API.post('groups?a=del',{gid}); closeModal(); go('#/groups'); }catch(err){ toast(err.message,'err'); }
}
/* Вкладки группы: перекрашиваем только #gtab-body с мягким появлением.
   Раньше render() гасил и пересобирал всю страницу (шапка, сайдбар, скролл). */
function paintGtab(g, htmlOverride){
  const body=document.getElementById('gtab-body');
  if(!body || !g) return false;
  const t=S.gtab||'hw';
  document.querySelectorAll('.gtab').forEach(b=>b.classList.toggle('on', b.dataset.tab===t));
  body.innerHTML = (htmlOverride != null) ? htmlOverride : groupTabBody(g,t);
  body.classList.remove('tabin'); void body.offsetWidth; body.classList.add('tabin');
  if(t==='hw' && typeof hydrate==='function') hydrate();
  return true;
}
function switchGtab(t){
  S.gtab=t;
  const g=_groupById(qp('id'));
  if(!g || !document.getElementById('gtab-body')){ render(); return; }
  if(t==='audit' && !S.audit.length){
    paintGtab(g,'<div class="paper" style="padding:22px 18px"><div class="empty dim">Загружаем журнал…</div></div>');
    API.get('groups?a=audit&id='+encodeURIComponent(g.id))
      .then(r=>{ S.audit=r.log||[]; if(S.gtab==='audit' && qp('id')===g.id) paintGtab(g); })
      .catch(e=>toast(e.message,'err'));
    return;
  }
  paintGtab(g);
}
function weekNav(off){
  S.weekOff=off;
  const g=_groupById(qp('id'));
  if(!g || !paintCalendar(g.id, null, true)) render();
}

/* ─────────── ссылки и уведомления ─────────── */
function openSlugRequest(gid){
  openModal(`
    <h3 style="font-size:20px;margin-bottom:6px">Красивая ссылка группы</h3>
    <p class="dim" style="font-size:13px">Латиница/цифры/_/-, 3–24 символа. Назначается сразу, менять можно в любой момент.</p>
    <div class="field"><div class="slugrow"><span>h.alc1.ru/g/</span>
      <input id="sl-slug" maxlength="24" placeholder="math-club"></div></div>
    <div class="row" style="margin-top:14px"><button class="btn sun" onclick="submitSlugReq('${gid}')">Назначить</button>
      <button class="btn ghost" onclick="closeModal()">Отмена</button></div>`);
}
async function submitSlugReq(gid){
  try{
    const r = await API.post('customlink?a=request',{kind:'group',gid,slug:$('#sl-slug').value.trim()});
    closeModal(); toast('🎯 Ссылка /g/'+r.slug+' назначена','ok'); render();
  }catch(err){ toast(err.message,'err'); }
}
function openUserSlug(){
  openModal(`
    <h3 style="font-size:20px;margin-bottom:6px">Ссылка профиля</h3>
    <p class="dim" style="font-size:13px">Латиница/цифры/_/-, 3–24 символа. Назначается сразу, менять можно в любой момент.</p>
    <div class="field"><div class="slugrow"><span>h.alc1.ru/@</span>
      <input id="us-slug" maxlength="24" value="${esc(me().slug||'')}"></div></div>
    <div class="row" style="margin-top:14px"><button class="btn sun" onclick="submitUserSlug()">Назначить</button>
      <button class="btn ghost" onclick="closeModal()">Отмена</button></div>`);
}
async function submitUserSlug(){
  try{
    const r = await API.post('customlink?a=request',{kind:'user',slug:$('#us-slug').value.trim()});
    closeModal(); toast('🎯 Ссылка /@'+r.slug+' назначена','ok'); render();
  }catch(err){ toast(err.message,'err'); }
}
async function decideReq(nid,ok){
  try{
    await API.post('customlink?a=decide',{id:nid,ok});
    await API.post('auth?a=notif-read',{id:nid});
    dropNotifRow(nid);
    toast(ok?'✅ Ссылка одобрена':'🚫 Заявка отклонена','info');
  }catch(err){ toast(err.message,'err'); }
}
/* Красиво убираем строку уведомления: затухание + сворачивание, без render() */
function dropNotifRow(nid){
  const el = document.querySelector('.notif-row[data-nid="'+nid+'"]');
  S.notifs = (S.notifs||[]).filter(n=>n.id!==nid);
  if(!el) return;
  const bar = el.closest('.notifbar');
  el.classList.add('notif-out');
  setTimeout(()=>{
    el.remove();
    if(bar && !bar.querySelector('.notif-row')){
      bar.classList.add('notif-out-bar');
      setTimeout(()=>bar.remove(), 260);
    }
  }, 240);
}
async function markRead(nid){
  dropNotifRow(nid);
  try{ await API.post('auth?a=notif-read',{id:nid}); }catch(e){}
}
async function applySlug(kind,slug,gid){
  try{
    const r=await API.post('customlink?a=apply',{kind,slug,gid:gid||null});
    toast('🎯 Ссылка назначена: /'+(kind==='group'?'g':'@')+'/'+esc(r.slug),'ok');
    render();
  }catch(err){ toast(err.message,'err'); }
}
async function decideReqById(rid,ok){
  try{
    await API.post('customlink?a=decide',{id:rid,ok});
    S.linkReqs=(S.linkReqs||[]).filter(r=>r.id!==rid);
    render(); toast(ok?'✅ Ссылка одобрена':'🚫 Заявка отклонена','info');
  }catch(err){ toast(err.message,'err'); }
}
async function reportUser(uid){
  if(!confirm('Пожаловаться на пользователя? Владелец увидит его при 5+ жалобах.')) return;
  try{ const r=await API.post('reports?a=report',{uid}); toast('Жалоба учтена ('+r.count+' из 5)','info'); }
  catch(err){ toast(err.message,'err'); }
}
/* ─────────── UUID группы ─────────── */
async function resetUuid(gid){
  if(!confirm('Сбросить UUID группы? Старая строка с UUID перестанет работать.')) return;
  try{
    await API.post('groups?a=reset_uuid',{id:gid});
    toast('♻ UUID обновлён','ok');
  }catch(err){ toast(err.message,'err'); }
}

/* ─────────── участники группы ─────────── */
function _groupById(gid){
  return (S.groups||[]).find(x=>x.id===gid) || (S.groupMap && S.groupMap.get(gid)) || null;
}
function openMembers(gid){
  const g = _groupById(gid);
  if(!g) return toast('Группа не загружена','err');
  const rows = (g.members||[]).map(m=>{
    const isCur = m.id===g.createdBy;
    const adm = (m.groupRole==='admin') || m.isAdmin;
    return `<div class="row" style="justify-content:space-between;align-items:center;gap:10px;background:rgba(255,255,255,.4);border-radius:8px;padding:8px 12px;margin-bottom:6px">
      <span>👤 <b>${esc(m.nick)}</b>
        ${isCur?'<span class="b cur">куратор</span>':''}
        ${adm?'<span class="b mod">админ</span>':''}
        ${(S.pubs||[]).includes(m.id)?'<span class="b mod">дз</span>':''}</span>
      <button class="btn tiny ghost" onclick="memberMenu('${gid}','${m.id}')">…</button>
    </div>`;
  }).join('') || '<div class="empty">Участников нет</div>';
  openModal(`
    <h3 style="font-size:20px;margin-bottom:6px">Участники</h3>
    <p class="dim" style="font-size:13px;margin-bottom:12px">Владелец группы может назначать администраторов.</p>
    ${rows}
    <button class="btn ghost" style="margin-top:10px" onclick="closeModal()">Закрыть</button>`);
}
function memberMenu(gid, uid){
  const g = _groupById(gid);
  const m = g && (g.members||[]).find(x=>x.id===uid);
  if(!m) return toast('Участник не найден','err');
  const isOwner = g.canManage;
  const isCur = uid === g.createdBy;
  const adm = (m.groupRole==='admin') || m.isAdmin;
  const adminBtn = (isOwner && !isCur)
    ? `<button class="btn sun" style="width:100%;margin-bottom:8px" onclick="setGroupAdmin('${gid}','${uid}',${!adm})">${adm?'Снять администратора':'Назначить администратором'}</button>`
    : '';
  const kickBtn = (isOwner && !isCur)
    ? `<button class="btn ghost" style="width:100%;margin-bottom:8px" onclick="kickMember('${gid}','${uid}')">Исключить из группы</button>`
    : '';
  openModal(`
    <h3 style="font-size:20px;margin-bottom:10px">${esc(m.nick)}</h3>
    ${adminBtn}${kickBtn}
    <button class="btn ghost" style="width:100%;margin-bottom:8px" onclick="closeModal();go('#/user?id=${uid}')">Открыть профиль</button>
    <button class="btn ghost" style="width:100%" onclick="closeModal()">Отмена</button>`);
}
async function setGroupAdmin(gid, uid, on){
  try{
    await API.post('groups?a=set_admin',{id:gid,uid,on});
    const g = _groupById(gid);
    if(g && g.members){ const m = g.members.find(x=>x.id===uid); if(m){ m.groupRole = on?'admin':'member'; m.isAdmin = on; } }
    closeModal(); toast(on?'⭐ Администратор назначен':'Администратор снят','ok'); render();
  }catch(err){ toast(err.message,'err'); }
}

/* ─────────── настройки прав группы ─────────── */
const SCOPE_NAMES = {all:'все', admins:'администраторы', owner:'владелец'};
function _scopeOpts(v){
  return ['all','admins','owner'].map(k=>`<option value="${k}"${v===k?' selected':''}>${SCOPE_NAMES[k]}</option>`).join('');
}
function openGroupSettings(gid){
  const g = _groupById(gid);
  if(!g || !g.canManage) return toast('Настройками управляет только владелец группы','err');
  const st = g.settings || {sched:'owner',tomorrow:'owner',publish:'owner'};
  openModal(`
    <h3 style="font-size:20px;margin-bottom:10px">Настройки группы</h3>

    <div class="row" style="margin-bottom:18px">
      <button class="btn sun" onclick="saveGroupSettings('${gid}')">Сохранить</button>
      <button class="btn ghost" onclick="closeModal()">Отмена</button>
    </div>

    <div onclick="toggleRights()" style="cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;user-select:none">
      <span>📁 Настройки прав</span><span id="gs-caret" style="font-size:12px">▸</span>
    </div>
    <div id="gs-rights" hidden style="margin-top:12px">
      <p class="dim" style="font-size:12px;margin-bottom:10px">Менять эти права может только владелец группы.</p>
      <div class="field"><label for="gs-sched">Кто меняет глобальное расписание</label>
        <select id="gs-sched">${_scopeOpts(st.sched)}</select></div>
      <div class="field"><label for="gs-tomorrow">Кто меняет расписание на завтра</label>
        <select id="gs-tomorrow">${_scopeOpts(st.tomorrow)}</select></div>
      <div class="field"><label for="gs-publish">Кто выкладывает ДЗ</label>
        <select id="gs-publish">${_scopeOpts(st.publish)}</select></div>
    </div>

    <div style="margin-top:22px;padding-top:16px;border-top:1.5px dashed rgba(0,0,0,.14)">
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn ghost" onclick="openMembers('${gid}')">👥 Участники</button>
        <button class="btn ghost" onclick="openPublishers('${gid}')">✍️ Издатели ДЗ</button>
        <button class="btn ghost" onclick="openSlugRequest('${gid}')">✨ Красивая ссылка</button>
        <button class="btn ghost" onclick="resetUuid('${gid}')">♻ Сбросить UUID</button>
      </div>
      <button class="btn tiny red" style="margin-top:18px" onclick="delGroup('${gid}')">🗑 Удалить группу</button>
    </div>`);
}
function toggleRights(){
  const box = $('#gs-rights'), caret = $('#gs-caret');
  if(!box) return;
  const hidden = box.hasAttribute('hidden');
  if(hidden){ box.removeAttribute('hidden'); if(caret) caret.textContent = '▾'; }
  else { box.setAttribute('hidden',''); if(caret) caret.textContent = '▸'; }
}
async function saveGroupSettings(gid){
  try{
    const r = await API.post('groups?a=set_settings',{id:gid,
      sched:$('#gs-sched').value, tomorrow:$('#gs-tomorrow').value, publish:$('#gs-publish').value});
    const g = _groupById(gid); if(g) g.settings = r.settings;
    closeModal(); toast('⚙ Настройки сохранены','ok');
  }catch(err){ toast(err.message,'err'); }
}

/* ─────────── автозаполнение расписания ─────────── */
function schedAutoPanel(){
  const dayPills = [1,2,3,4,5,6].map(d=>`
    <label class="af-daypill">
      <input type="checkbox" class="af-day" value="${d}"${d>=2?' checked':''}>
      <span>${DAY_NAMES[d-1]}</span>
    </label>`).join('');
  return `<div class="sched-auto">
    <div class="sa-title">⚡ Быстрое заполнение <span class="sa-sub">сетка на выбранные дни</span></div>
    <div class="sa-fields">
      <label class="sa-field"><span>Начало</span><input type="time" id="af-start" value="08:30"></label>
      <label class="sa-field"><span>Урок, мин</span><input type="number" id="af-lesson" value="45" min="15" max="120"></label>
      <label class="sa-field"><span>Перемена</span><input type="number" id="af-break" value="10" min="0" max="60"></label>
      <label class="sa-field"><span>Уроков</span><input type="number" id="af-per" value="7" min="1" max="10"></label>
      <button class="btn sun sa-go" onclick="schedAutoFill()">Заполнить</button>
    </div>
    <div class="sa-days">${dayPills}</div>
  </div>`;
}
function schedAutoFill(){
  const start = ($('#af-start').value || '08:30');
  const lm = Math.max(15, Math.min(120, parseInt($('#af-lesson').value || '45', 10)));
  const bm = Math.max(0, Math.min(60, parseInt($('#af-break').value || '10', 10)));
  const per = Math.max(1, Math.min(10, parseInt($('#af-per').value || '7', 10)));
  const days = [...document.querySelectorAll('.af-day:checked')].map(c=>+c.value);
  if(!days.length) return toast('Выберите хотя бы один день','err');
  const mm = String(start).split(':').map(Number);
  const base = (mm[0]||8)*60 + (mm[1]||0);
  const pad = n => String(n).padStart(2,'0');
  const hm = m => pad(Math.floor(m/60)%24) + ':' + pad(m%60);
  for(const d of days){
    let t = base;
    const rows = [];
    for(let i=0;i<per;i++){
      rows.push({day:d, slot:i+1, subject:'Урок '+(i+1), start:hm(t), finish:hm(t+lm), cab:''});
      t += lm + bm;
    }
    S.schedData[d] = rows;
    if(!S.schedDays.includes(d)) S.schedDays.push(d);
  }
  S.schedDays.sort((a,b)=>a-b);
  S.schedTab = days[0];
  openModal(scheduleHTML());
  toast('⏱ Заполнено: '+days.length+' дн. по '+per+' уроков','ok');
}


/* ─────────── папка «Мои группы» в сайдбаре ─────────── */
function toggleNavFolder(){
  S.navOpen = !S.navOpen;
  render();
}
