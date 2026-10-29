// почта убрана из проекта
// const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// почта убрана из проекта — сервер ищет только по нику
function idPayload(raw){
  const v = raw.trim(), p = {nick: v};
  // if(EMAIL_RE.test(v)) p.email = v.toLowerCase();
  return p;
}

async function onLogin(e){
  e.preventDefault();
  try{
    const r = await API.post('auth?a=login', {
      ...idPayload($('#lg-id').value),
      password: $('#lg-pw').value
    });
    S.ses = {uid:r.user.id, prv:JSON.parse(r.user.prv)};
    S.me = r.user;
    localStorage.setItem('hw_session', JSON.stringify({
      uid:r.user.id, nick:r.user.nick,   // почта убрана: email:r.user.email || null,
      role:r.user.role, ts:r.user.ts, pub:r.user.pub,
      slug:r.user.slug || null,
      prv:JSON.parse(r.user.prv)
    }));
    render();
    toast('Добро пожаловать, ' + r.user.nick + '!', 'ok');
  }catch(err){ toast(err.message, 'err'); }
  return false;
}

async function onReg(e){
  e.preventDefault();
  try{
    const r = await API.post('auth?a=register', {
      nick: $('#rg-nick').value.trim(),
      // email: $('#rg-email').value.trim().toLowerCase(),   // почта убрана из проекта
      password: $('#rg-pw').value,
      cap: $('#capInput').value,
      pow: S.pow
    });
    S.ses = {uid:r.user.id, prv:JSON.parse(r.user.prv)};
    S.me = r.user;
    localStorage.setItem('hw_session', JSON.stringify({
      uid:r.user.id, nick:r.user.nick,   // почта убрана: email:r.user.email || null,
      role:r.user.role, ts:r.user.ts, pub:r.user.pub,
      prv:JSON.parse(r.user.prv)
    }));
    render();
    toast('Аккаунт создан. Вы — ' + (r.user.role==='owner'?'Владелец 👑':'ученик'), 'ok');
  }catch(err){ toast(err.message, 'err'); }
  return false;
}

async function unlock(e){
  e.preventDefault();
  const pw = $('#ul-pw').value;
  try{
    const r = await API.post('auth?a=login', {
      ...idPayload(S.me.nick),
      password: pw
    });
    S.ses.prv = JSON.parse(r.user.prv);
    S.me = r.user;
    const saved = JSON.parse(localStorage.getItem('hw_session') || '{}');
    saved.prv = JSON.parse(r.user.prv);  // ✅ Сохраняем как объект
    // saved.email = r.user.email || saved.email || null;      // почта убрана из проекта
    localStorage.setItem('hw_session', JSON.stringify(saved));
    render();
    toast('Добро пожаловать, ' + r.user.nick + '!', 'ok');
  }catch(err){ toast(err.message, 'err'); }
  return false;
}

function logout(){
  localStorage.removeItem('hw_session');
  S.ses = null; S.me = null;
  if(typeof stopLivePoll === 'function') stopLivePoll();
  API.post('auth?a=logout').catch(()=>{});
  render();
}

function logoutFull(){
  localStorage.removeItem('hw_session');
  S.ses = null; S.me = null;
  if(typeof stopLivePoll === 'function') stopLivePoll();
  API.post('auth?a=logout').catch(()=>{});
  location.reload();
}