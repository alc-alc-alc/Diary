/* ═══════════ util.js ═══════════
   Утилиты: DOM, форматирование, расписание, UI, капча/PoW */

/* ─────────── DOM ─────────── */
function $(id){ return document.getElementById(id.replace(/^#/, '')); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function go(h){ location.hash=h; }
function qp(name){ const i=location.hash.indexOf('?'); if(i<0) return null; return new URLSearchParams(location.hash.slice(i+1)).get(name); }
function me(){ return S.me; }

/* ─────────── форматирование ─────────── */
const fmtDate = ts => new Date(ts < 1e12 ? ts*1000 : ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
function fmtPhone(p){
  const d=(p||'').replace(/\D/g,'');
  if(d.length===11) return '+'+d[0]+' ('+d.slice(1,4)+') '+d.slice(4,7)+'-'+d.slice(7,9)+'-'+d.slice(9);
  return p||'';
}
function roleBadge(r){
  if(r==='owner') return '<span class="b owner">ВЛАДЕЛЕЦ</span>';
  if(r==='admin') return '<span class="b admin">АДМИН</span>';
  if(r==='mod') return '<span class="b mod">МОД</span>';
  return '';
}

const style = document.createElement('style');
style.textContent = `
@keyframes toastIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes toastBar {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
}
/* color: inherit !important раньше висел на ВСЕХ элементах модалки и перебивал
   собственные цвета (тёмная панель «Быстрое заполнение» в расписании становилась
   нечитаемой). Теперь правило не трогает блок .sched-auto. */
#modal-root *:not(.mcard):not(.sched-auto):not(.sched-auto *) {
    color: inherit !important;
}
#modal-root *,
#modal-root .sched-auto,
#modal-root .sched-auto * {
    box-sizing: border-box !important;
}
`;
document.head.appendChild(style);

/* ─────────── расписание и календарь ─────────── */
const DAY_NAMES=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
function isoLocal(d){ const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function parseIso(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function fmtRuDate(s){ const d=parseIso(s); return d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}); }
function nextOccurrence(sched, cancels, subject, fromIso){
  const base=fromIso?parseIso(fromIso):new Date();
  for(let i=0;i<28;i++){
    const d=new Date(base); d.setDate(base.getDate()+i);
    const wd=d.getDay(); const day= wd===0?7:wd; if(day>7) continue;
    const date=isoLocal(d);
    const rows=sched.filter(r=>+r.day===day && r.subject===subject)
                    .sort((a,b)=>String(a.start).localeCompare(String(b.start))||a.slot-b.slot);
    for(const r of rows){
      const k=date+'|'+r.id;
      if(!cancels.has(k)) return {date,row:r};
    }
  }
  return null;
}
function weekDates(offset){
  const now=new Date(); const wd=now.getDay();
  const mon=new Date(now); mon.setDate(now.getDate()-((wd+6)%7)+offset*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
}

/* ─────────── UI: тосты, модалки, копирование ─────────── */
function toast(msg,type='info') {
    let container = document.getElementById('toasts');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toasts';
        document.body.appendChild(container);
    }

    const el=document.createElement('div');
    el.className='toast '+(type==='err'?'err':type==='ok'?'ok':type==='key'?'key':'info');
    el.innerHTML=msg;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 400);
    }, 4000);
    /* el.style.cssText = `
        background: ${type==='err'?'#d62828':type==='ok'?'#2fbf8f':type==='key'?'#3a86c8':'#e5a50a'} !important;
        color: #fff !important;
        border-left: 6px solid rgba(255,255,255,0.5) !important;
        padding: 12px 16px 18px 16px !important;
        border-radius: 6px !important;
        box-shadow: 0 14px 26px rgba(0,0,0,.4) !important;
        font: 500 14px 'Golos Text' !important;
        max-width: 340px !important;
        min-width: 220px !important;
        animation: tin .3s ease !important;
        position: relative !important;
        overflow: hidden !important;
    `;
    el.innerHTML = `
        <div style="line-height:1.4;postition:relative;z-index:1;color:#fff !important">${msg}</div>
        <div class="toast-bar" style="
            postition: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            height: 3px !important;
            width: 100% !important;
            background: rgba(255,255,255,0.5) !important;
            transform-origin: left !important;
            animation: toastBar 4s linear forwards !important;
        "></div>
    `;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity='0'; 
        setTimeout(() => el.remove(), 300);
    },4000); */
}

function openModal(html){
    let m = document.getElementById('modal-root');
    if (!m) { 
        m=document.createElement('div'); 
        m.id='modal-root';
        document.body.appendChild(m); 
    }
    m.innerHTML = `
        <div class="ovl" onclick="if(event.target===this)closeModal()">
            <div class="mcard paper holes">${html}</div>
        </div>
    `;
    /* m.style.cssText = `
        postition: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        z-index: 999998 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 20px !important;
        margin: 0 !important;
    `;
    m.innerHTML = `
        <div class="ovl" onclick="closeModal()"  style="
            postition: fixed !important;
            inset: 0 !important;
            background: rgba(3,18,14,.66) !important;
            backdrop-filter: blur(2px) !important;
            z-index: 250 !important;
            display: flex !important;
            padding: 20px !important;
            overflow: auto !important;
        "></div>
        <div class="mcard paper holes" style="
            margin: auto !important;
            width: 100% !important;
            max-width: 540px !important;
            padding: 34px 30px 30px !important;
            animation: pop .28s cubic-bezier(.2,1.4,.5,1) !important;
            background: var(--paper) !important;
            color: var(--ink) !important;
            border-radius: 6px !important;
            box-shadow: var(--shadow) !important;
        ">${html}</div>
    `; */
}

function closeModal() {
    const m = document.getElementById('modal-root'); 
    if(m) m.innerHTML='';
}

function copyText(t){
  navigator.clipboard.writeText(t).then(()=>toast('Скопировано','ok')).catch(()=>toast('Не удалось скопировать','err'));
}
function switchTab(t){ S.tab=t; render(); }

/* ─────────── капча и PoW ─────────── */
let CAP_CODE='';
function drawCaptcha(){
  const c=$('#capCanvas'); if(!c) return;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#f5efdc'; ctx.fillRect(0,0,c.width,c.height);
  const abc='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  CAP_CODE='';
  for(let i=0;i<5;i++){
    CAP_CODE+=abc[Math.floor(Math.random()*abc.length)];
    ctx.fillStyle=`hsl(${Math.random()*360},60%,30%)`;
    ctx.font=`bold ${20+Math.random()*8}px Unbounded`;
    ctx.save();
    ctx.translate(20+i*28,35);
    ctx.rotate((Math.random()-0.5)*0.6);
    ctx.fillText(CAP_CODE[i],0,0);
    ctx.restore();
  }
  for(let i=0;i<4;i++){
    ctx.strokeStyle=`hsl(${Math.random()*360},70%,50%)`;
    ctx.lineWidth=1+Math.random();
    ctx.beginPath();
    ctx.moveTo(Math.random()*c.width,Math.random()*c.height);
    ctx.lineTo(Math.random()*c.width,Math.random()*c.height);
    ctx.stroke();
  }
}
function pwStrength(pw){
  const bar=$('#pwbar'); if(!bar) return;
  let s=0;
  if(pw.length>=8) s++; if(pw.length>=12) s++;
  if(/[A-Z]/.test(pw)) s++; if(/[0-9]/.test(pw)) s++;
  if(/[^A-Za-z0-9]/.test(pw)) s++;
  const colors=['#d62828','#f77f00','#e5a50a','#2fbf8f','#06a77d'];
  bar.style.width=(s*20)+'%';
  bar.style.background=colors[Math.min(s,4)]||'#d62828';
}
async function runPow(btn){
  if(!btn) return;
  btn.disabled=true; btn.textContent='🤖 Считаем...';
  const challenge=Math.random().toString(36).slice(2,10);
  let nonce=0;
  const start=Date.now();
  while(true){
    const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(challenge+nonce));
    const hex=Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hex.startsWith('0000')) break;
    nonce++;
    if(nonce%10000===0) await new Promise(r=>setTimeout(r,0));
  }
  S.pow={challenge,nonce,time:Date.now()-start};
  btn.textContent='✓ Проверка пройдена ('+nonce+' итераций)';
  btn.style.background='var(--sun)';
  btn.style.color='#27200a';
}

/* ─────────── навигация ─────────── */
let NAV='home';
