/* ═══════════ crypto.js ═══════════ */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = {
  fromBuf: buf => btoa(String.fromCharCode(...new Uint8Array(buf))),
  toBuf: str => Uint8Array.from(atob(str), c => c.charCodeAt(0))
};
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const HAS_SUBTLE = !!crypto.subtle;

function hexToU8(h){
  const u = new Uint8Array(h.length/2);
  for(let i=0;i<u.length;i++) u[i]=parseInt(h.substr(i*2,2),16);
  return u;
}
function u8ToHex(u){ return Array.from(u).map(b=>b.toString(16).padStart(2,'0')).join(''); }

async function kdf(pass, salt){
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    {name:'PBKDF2', salt, iterations:120000, hash:'SHA-256'}, key, 256));
}

async function aesGcmEncrypt(key, iv, data){
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, tagLength:128}, k, data));
}
async function aesGcmDecrypt(key, iv, ct){
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv, tagLength:128}, k, ct));
}

async function decryptLesson(l){
  try{
    const key = await decryptWrapped(l.keys[S.ses.uid]);
    const iv = b64.toBuf(l.iv);
    const ct = b64.toBuf(l.ct);
    return dec.decode(await aesGcmDecrypt(key, iv, ct));
  }catch(e){
    console.error('Ошибка расшифровки:', e);
    throw new Error('Не удалось расшифровать. Возможно, ключ устарел.');
  }
}

async function decryptWrapped(wrappedHex){
  const data = hexToU8(wrappedHex);
  if(HAS_SUBTLE){
    const jwk = Object.assign({}, S.ses.prv, {alg:'RSA-OAEP'}); // гасим конфликт alg/hash
    const pk = await crypto.subtle.importKey('jwk', jwk, {name:'RSA-OAEP', hash:'SHA-1'}, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({name:'RSA-OAEP'}, pk, data));
  }
  throw new Error('Web Crypto API не поддерживается');
}

async function generateRSAKeyPair(){
  const kp = await crypto.subtle.generateKey(
    {name:'RSA-OAEP', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-1'},
    true, ['encrypt','decrypt']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const prv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return {pub, prv};
}

async function encryptPrv(prvJwk, password, salt){
  const key = await kdf(password, salt);
  const iv = rnd(12);
  const data = enc.encode(JSON.stringify(prvJwk));
  const ct = await aesGcmEncrypt(key, iv, data);
  return u8ToHex(new Uint8Array([...iv, ...ct]));
}

async function decryptPrv(prvBoxHex, password, salt){
  const box = hexToU8(prvBoxHex);
  const iv = box.slice(0,12);
  const ct = box.slice(12);
  const key = await kdf(password, salt);
  const data = await aesGcmDecrypt(key, iv, ct);
  return JSON.parse(dec.decode(data));
}