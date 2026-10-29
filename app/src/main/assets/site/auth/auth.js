const HW_API = 'https://h.alc1.ru/api/';
const SHA256 = (() => {
    const K = new Uint32Array([
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const rotr = (x,n) => (x>>>n)|(x<<(32-n));
    return function(bytes){
        const l = bytes.length, total = Math.ceil((l+9)/64)*64;
        const buf = new Uint8Array(total); buf.set(bytes); buf[l]=0x80;
        const dv = new DataView(buf.buffer), bits = l*8;
        dv.setUint32(total-8, Math.floor(bits/4294967296)); dv.setUint32(total-4, bits>>>0);
        let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
            h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
        const w = new Uint32Array(64);
        for(let i=0;i<total;i+=64){
            for(let t=0;t<16;t++) w[t]=dv.getUint32(i+t*4);
            for(let t=16;t<64;t++){
                const s0=rotr(w[t-15],7)^rotr(w[t-15],18)^(w[t-15]>>>3);
                const s1=rotr(w[t-2],17)^rotr(w[t-2],19)^(w[t-2]>>>10);
                w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;
            }
            let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
            for(let t=0;t<64;t++){
                const S1=rotr(e,6)^rotr(e,11)^rotr(e,25), ch=(e&f)^((~e)&g);
                const t1=(h+S1+ch+K[t]+w[t])>>>0;
                const S0=rotr(a,2)^rotr(a,13)^rotr(a,22), maj=(a&b)^(a&c)^(b&c);
                const t2=(S0+maj)>>>0;
                h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
            }
            h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;
            h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
        }
        const o=new Uint8Array(32), ov=new DataView(o.buffer);
        ov.setUint32(0,h0);ov.setUint32(4,h1);ov.setUint32(8,h2);ov.setUint32(12,h3);
        ov.setUint32(16,h4);ov.setUint32(20,h5);ov.setUint32(24,h6);ov.setUint32(28,h7);
        let hex=''; for(const b of o) hex+=b.toString(16).padStart(2,'0'); return hex;
    };
})();
let POW = null, VIEW = 'login', PACK = null;
const $ = id => document.getElementById(id);
const NICK_RE = /^[\w\u0400-\u04FF-]{3,16}$/;
// почта убрана из проекта
// const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const MIN_PW = 8;

function setCookie(n,v,sec){document.cookie=n+'='+encodeURIComponent(v)+';path=/;domain=.alc1.ru;max-age='+sec+';Secure;SameSite=Lax';}

/* ——— сообщения ——— */
function showErr(e){ $('info').textContent=''; $('err').textContent = (e && e.message) ? e.message : String(e); }
function showInfo(t){ $('err').textContent=''; $('info').textContent = t; }
function clearMsg(){ $('err').textContent=''; $('info').textContent=''; }

/* ——— защита от ботов (proof-of-work) ——— */
function setPow(state){
    document.querySelectorAll('.pow-status').forEach(el => {
        el.textContent = '';
        if(state==='loading') el.textContent = 'Готовим защиту от ботов…';
        else if(state==='ready') el.textContent = 'Защита от ботов готова';
        else if(state==='solving') el.textContent = 'Проверяем, что вы человек…';
        else if(state==='fail'){
            el.append('Защита от ботов не загрузилась. ');
            const b = document.createElement('button');
            b.type='button'; b.className='link'; b.textContent='Повторить';
            b.onclick = () => fetchPow().catch(()=>{});
            el.append(b);
        }
    });
}
async function fetchPow(){
    setPow('loading');
    try{
        const r = await fetch(HW_API + 'auth?a=pow_challenge');
        const j = await r.json().catch(()=>null);
        if(!j) throw new Error('Защита не загрузилась: пустой ответ ('+r.status+')');
        if(!j.ok) throw new Error(j.error || 'Нет челленджа');
        POW = j; setPow('ready'); return POW;
    }catch(e){ POW = null; setPow('fail'); throw e; }
}
function solvePow(challenge, difficulty){
    const target = '0'.repeat(difficulty);
    const enc = new TextEncoder();
    let nonce = Math.floor(Math.random()*1e9);
    return new Promise(resolve => {
        (function chunk(){
            for(let i=0;i<4000;i++,nonce++){
                if(SHA256(enc.encode(challenge+':'+nonce)).startsWith(target)) return resolve(nonce);
            }
            setTimeout(chunk, 0);
        })();
    });
}
async function withPow(payload, hpValue){
    if(!POW) await fetchPow();
    setPow('solving');
    const nonce = await solvePow(POW.challenge, POW.difficulty);
    payload.pow_challenge = POW.challenge;
    payload.pow_nonce = String(nonce);
    payload.website = hpValue;
    return payload;
}
async function call(a, data){
    let r;
    try{
        r = await fetch(HW_API + 'auth?a=' + a, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
    }catch(_){ throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'); }
    const j = await r.json().catch(()=>null);
    if(!j) throw new Error('Сервер вернул пустой ответ (HTTP '+r.status+')');
    if(!j.ok) throw new Error(j.error || 'Ошибка');
    return j;
}

/* ——— экраны ——— */
const LEADS = {
    login:'Вход в аккаунт Amore.',
    reg:'Один аккаунт для всех проектов Amore.',
    reset:'Вернём доступ по ключу восстановления.',
    key:'Остался один шаг.'
};
const FIRST = {login:'lg-id', reg:'rg-nick', reset:'rs-nick'};
function show(v){
    VIEW = v;
    $('f-login').hidden = v!=='login';
    $('f-reg').hidden = v!=='reg';
    $('f-reset').hidden = v!=='reset';
    $('key-view').hidden = v!=='key';
    $('tabs').hidden = !(v==='login' || v==='reg');
    $('tab-login').classList.toggle('on', v==='login');
    $('tab-reg').classList.toggle('on', v==='reg');
    $('tab-login').setAttribute('aria-current', v==='login' ? 'true' : 'false');
    $('tab-reg').setAttribute('aria-current', v==='reg' ? 'true' : 'false');
    $('lead').textContent = LEADS[v];
    // В режиме регистрации большой заголовок «Аккаунт Amore» убираем (просил владелец):
    // карточка и так подписана вкладкой «Регистрация».
    document.body.classList.toggle('mode-reg', v === 'reg');
    clearMsg();
    const f = FIRST[v]; if(f) $(f).focus();
}
function setBusy(btn, on, text){
    if(on){ btn.dataset.t = btn.textContent; btn.textContent = text; btn.disabled = true; }
    else { if(btn.dataset.t) btn.textContent = btn.dataset.t; btn.disabled = false; }
}

/* ——— пароль: показать/скрыть ——— */
document.querySelectorAll('.reveal').forEach(b => b.addEventListener('click', () => {
    const inp = $(b.dataset.for), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.textContent = show ? 'Скрыть' : 'Показать';
    b.setAttribute('aria-pressed', String(show));
}));

/* ——— почта убрана из проекта: ищем только по нику ——— */
function idPayload(raw){
    const v = raw.trim(), p = {nick: v};
    // if(EMAIL_RE.test(v)) p.email = v.toLowerCase();
    return p;
}

/* ——— после входа ——— */
function afterAuth(j){
    const next = new URLSearchParams(location.search).get('next');
    if(j && j.nick && j.nick!=='undefined' && j.nick!=='null') setCookie('hw_nick', j.nick, 7*86400);
    if(j && j.ticket) setCookie('hw_ticket', j.ticket, 300);
    const TARGETS = {h:'https://h.alc1.ru/', account:'https://my.alc1.ru/'};
    location.href = TARGETS[next] || 'https://alc1.ru/';
}

/* ——— экран с ключом восстановления ——— */
const KEY_TEXT = {
    reg:   ['Сохраните ключ восстановления', 'Он нужен, если вы забудете пароль. Мы показываем его один раз. Без пароля и без ключа данные аккаунта не вернуть.'],
    reset: ['Пароль изменён. Сохраните новый ключ', 'Старый ключ больше не действует. Новый показывается один раз.'],
    old:   ['Теперь у аккаунта есть ключ восстановления', 'Он нужен, если вы забудете пароль. Мы показываем его один раз. Без пароля и без ключа данные аккаунта не вернуть.']
};
function showKey(j, kind){
    PACK = {nick:j.nick, ticket:j.ticket, at:Date.now(), code:j.recovery};
    $('key-title').textContent = KEY_TEXT[kind][0];
    $('key-text').textContent = KEY_TEXT[kind][1];
    $('key-code').textContent = j.recovery;
    $('key-ok').checked = false; $('key-go').disabled = true;
    show('key');
    window.onbeforeunload = () => PACK ? 'Вы не сохранили ключ восстановления.' : undefined;
}
$('key-ok').addEventListener('change', e => { $('key-go').disabled = !e.target.checked; });
$('key-copy').addEventListener('click', async () => {
    const b = $('key-copy'), t = b.textContent;
    try{ await navigator.clipboard.writeText(PACK.code); b.textContent = 'Скопировано'; }
    catch(_){
        const r = document.createRange(); r.selectNodeContents($('key-code'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        b.textContent = 'Выделено, нажмите Ctrl+C';
    }
    setTimeout(() => b.textContent = t, 2200);
});
$('key-dl').addEventListener('click', () => {
    const txt = 'Amore: ключ восстановления\r\nАккаунт: ' + PACK.nick + '\r\nКлюч: ' + PACK.code +
        '\r\n\r\nХраните ключ отдельно от пароля. Он нужен, чтобы задать новый пароль и не потерять данные.\r\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], {type:'text/plain;charset=utf-8'}));
    a.download = 'amore-recovery-' + PACK.nick + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('key-go').addEventListener('click', () => {
    const p = PACK; window.onbeforeunload = null;
    if(Date.now() - p.at > 840000){   // тикет живёт 15 минут
        PACK = null; show('login'); $('lg-id').value = p.nick;
        showInfo('Ключ сохранён. Вход устарел, введите пароль ещё раз.');
        $('lg-pw').focus(); return;
    }
    PACK = null; afterAuth(p);
});

/* ——— отправка форм ——— */
async function doLogin(e){
    e.preventDefault(); clearMsg();
    const idv = $('lg-id').value.trim(), pw = $('lg-pw').value;
    if(!idv || !pw) return showErr('Введите ник и пароль'), false;
    const btn = $('lg-btn'); setBusy(btn, true, 'Входим…');
    try{
        const payload = await withPow({...idPayload(idv), password: pw}, $('lg-hp').value);
        const j = await call('sso_login', payload);
        if(j.recovery) showKey(j, 'old'); else afterAuth(j);
    }catch(err){ showErr(err); fetchPow().catch(()=>{}); }
    finally{ setBusy(btn, false); }
    return false;
}
async function doReg(e){
    e.preventDefault(); clearMsg();
    const nick = $('rg-nick').value.trim(), pw = $('rg-pw').value;
    // const email = $('rg-email').value.trim().toLowerCase();      // почта убрана из проекта
    if(!NICK_RE.test(nick)) return showErr('Ник: 3–16 символов, только буквы, цифры, _ и -'), false;
    // if(!EMAIL_RE.test(email)) return showErr('Email: введите корректный адрес, например user@mail.ru'), false;
    if(pw.length < MIN_PW) return showErr('Пароль: минимум ' + MIN_PW + ' символов'), false;
    if(!$('rg-terms').checked || !$('rg-pd').checked) return showErr('Отметьте оба согласия: условия использования и обработку данных'), false;
    const btn = $('rg-btn'); setBusy(btn, true, 'Создаём аккаунт…');
    try{
        const payload = await withPow({nick, password: pw, consent_terms: true, consent_pd: true}, $('rg-hp').value);
        const j = await call('sso_register', payload);
        showKey(j, 'reg');
    }catch(err){ showErr(err); fetchPow().catch(()=>{}); }
    finally{ setBusy(btn, false); }
    return false;
}
async function doReset(e){
    e.preventDefault(); clearMsg();
    const idv = $('rs-nick').value.trim(), key = $('rs-key').value, pw = $('rs-pw').value;
    if(!idv) return showErr('Введите ник'), false;
    if(key.replace(/[^A-Za-z0-9]/g,'').length !== 24) return showErr('Ключ восстановления состоит из 24 символов, например XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'), false;
    if(pw.length < MIN_PW) return showErr('Новый пароль: минимум ' + MIN_PW + ' символов'), false;
    const btn = $('rs-btn'); setBusy(btn, true, 'Меняем пароль…');
    try{
        const payload = await withPow({...idPayload(idv), recovery: key, new_password: pw}, $('rs-hp').value);
        showKey(await call('sso_reset', payload), 'reset');
    }catch(err){ showErr(err); fetchPow().catch(()=>{}); }
    finally{ setBusy(btn, false); }
    return false;
}

window.addEventListener('load', () => fetchPow().catch(()=>{}));й