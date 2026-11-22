import { loadConfig } from './config.js';
import { save, applyCloudSave, prepareCloudSave } from './save.js';

const prefix='cendres-account-v1:';
const letters=/^[\p{L}\p{N}_-]{3,16}$/u;
const transient=new Set([408,425,429]);
let config, session, timer, active, generation=0, dirty=false, delay=1000;
export const account={ status:'loading', profile:null, secured:false, busy:false, notice:'' };

const read=key=>{ try { return JSON.parse(localStorage.getItem(prefix+key)); } catch { return null; } };
const write=(key,value)=>{
  if(value===null) localStorage.removeItem(prefix+key);
  else localStorage.setItem(prefix+key,JSON.stringify(value));
};
const emit=()=>window.dispatchEvent(new Event('cendres:account'));
const snapshot=()=>JSON.stringify(save);
const lock=(key,action)=>navigator.locks ? navigator.locks.request(prefix+key,action) : action();

async function request(path,method='GET',body,token) {
  const headers={apikey:config.key};
  if(token) headers.Authorization='Bearer '+token;
  if(body!==undefined) headers['Content-Type']='application/json';
  const response=await fetch(config.url+path,{method,headers,
    body:body===undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(9000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok) {
    const error=new Error('Service indisponible');
    error.status=response.status;
    error.code=data?.error_code ?? data?.code;
    if(error.code==='P0001') error.detail=data?.message;
    throw error;
  }
  return data;
}

function setSession(data,expectedGeneration=generation) {
  if(expectedGeneration!==generation) throw Error('Compte modifié');
  if(!data?.access_token || !data?.refresh_token || !data?.user?.id) throw Error('Session invalide');
  const next={
    id:data.user.id, anonymous:!!data.user.is_anonymous, access:data.access_token,
    refresh:data.refresh_token, until:Date.now()+Number(data.expires_in||3600)*1000
  };
  write('session',next);
  session=next;
  account.secured=!next.anonymous;
}

function redirectTo() { return new URL('./',location.href).href; }

function callback() {
  const url=new URL(location.href);
  const fragment=new URLSearchParams(url.hash.slice(1));
  const code=url.searchParams.get('code');
  const error=url.searchParams.get('error') || fragment.get('error');
  if(!code && !error && !fragment.has('access_token')) return;
  const intent=read('link');
  if(code && intent?.verifier && Date.now()-intent.time<3600000) write('link',{...intent,code});
  else {
    write('link',null);
    account.notice='Lien expiré ou ouvert dans un autre navigateur. Demande un nouveau lien ici.';
  }
  for(const key of ['code','error','error_code','error_description']) url.searchParams.delete(key);
  url.hash='';
  history.replaceState(null,'',url);
}

async function authenticate(expected) {
  const intent=read('link');
  if(intent?.code) {
    try {
      const data=await request('/auth/v1/token?grant_type=pkce','POST',{auth_code:intent.code,code_verifier:intent.verifier});
      if(intent.mode==='secure' && data?.user?.id!==intent.user) throw Error('Compte différent');
      setSession(data,expected);
      account.notice='Compte sécurisé et connecté.';
      write('link',null);
      return;
    } catch(error) {
      if(!error.status || transient.has(error.status) || error.status>=500) throw error;
      write('link',null);
      account.notice='Lien expiré. Demande un nouveau lien.';
    }
  }
  session=read('session');
  if(session) {
    if(session.until>Date.now()+60000) { account.secured=!session.anonymous; return; }
    try {
      setSession(await request('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:session.refresh}),expected);
      return;
    } catch(error) {
      if(error.status!==400 && error.status!==401) throw error;
      if(!session.anonymous) {
        account.secured=false;
        account.notice='Session expirée. Récupère ton compte par e-mail.';
        throw error;
      }
      write('session',null);
      session=null;
    }
  }
  setSession(await request('/auth/v1/signup','POST',{data:{}}),expected);
}

export function socialConnection() {
  return account.status==='online' && config && session ? {url:config.url,key:config.key,id:session.id,token:session.access,until:session.until} : null;
}
export function socialRpc(name,body) { return rpc(name,body); }

function rpc(name,body,token=session?.access) { return request('/rest/v1/rpc/'+name,'POST',body,token); }

function deviceId() {
  let id=read('device');
  if(!id) { id=crypto.randomUUID(); write('device',id); }
  return id;
}

async function syncSave(id,token,expected) {
  const device=deviceId();
  const journalKey='sync:'+id+':'+device;
  const journal=read(journalKey) ?? {seq:0,base:null};
  if(journal.apply) {
    const current=snapshot();
    if(current===journal.apply.before) applyCloudSave(JSON.parse(journal.apply.after));
    journal.base=current===journal.apply.before || current===journal.apply.after ? snapshot() : journal.apply.before;
    delete journal.apply;
    write(journalKey,journal);
  }
  for(let i=0;i<3;i++) {
    const job=journal.pending ?? {seq:journal.seq+1,state:snapshot(),base:journal.base};
    journal.pending=job;
    write(journalKey,journal);
    const answer=await rpc('sync_solo_save',{
      p_device:device,p_seq:job.seq,p_save:JSON.parse(job.state),p_base:job.base ? JSON.parse(job.base) : {}
    },token);
    if(expected!==generation) return;
    if(!answer || answer.version!==2 || !Array.isArray(answer.upgrades)) throw Error('Sauvegarde distante invalide');
    journal.seq=job.seq;
    delete journal.pending;
    const stable=snapshot()===job.state;
    if(stable) {
      const {goldBalance,...cloud}=answer;
      journal.apply={before:job.state,after:JSON.stringify(prepareCloudSave(cloud))};
      write(journalKey,journal);
      applyCloudSave(cloud);
      journal.base=snapshot();
      delete journal.apply;
    } else journal.base=job.state;
    write(journalKey,journal);
    if(stable) return;
  }
  dirty=true;
}

function schedule(ms=400) {
  dirty=true;
  clearTimeout(timer);
  if(!navigator.onLine || document.hidden) return;
  timer=setTimeout(synchronize,ms);
}

export function synchronize() {
  if(active) { dirty=true; return active; }
  if(!navigator.onLine) { account.status='offline'; emit(); return Promise.resolve(); }
  dirty=false;
  const expected=generation;
  active=lock('account',async()=>{
    try {
      if(!config) config=await loadConfig();
      if(expected!==generation) return;
      if(!config) { account.status='unconfigured'; return; }
      await authenticate(expected);
      if(expected!==generation) return;
      const id=session.id, token=session.access;
      if(account.profile?.id!==id) {
        const profile=await rpc('ensure_profile',{},token);
        if(expected!==generation) return;
        account.profile=profile;
      }
      await syncSave(id,token,expected);
      if(expected!==generation) return;
      account.status='online';
      delay=1000;
    } catch(error) {
      if(expected!==generation) return;
      account.status=navigator.onLine ? 'error' : 'offline';
      if(!error.status || transient.has(error.status) || error.status>=500) {
        delay=Math.min(60000,delay*2);
        schedule(delay);
      }
    } finally { emit(); }
  }).finally(()=>{
    active=null;
    if(dirty && account.status!=='error' && account.status!=='unconfigured') schedule();
  });
  return active;
}

function verification(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

export async function sendAccountLink(mode,email) {
  if(account.busy || !navigator.onLine) return;
  account.busy=true;
  account.notice='';
  emit();
  try {
    if(active) await active;
    if(!config) config=await loadConfig();
    if(!config) throw Error('Configuration absente');
    const expected=generation;
    await lock('account',async()=>{
      const current=read('session');
      const verifier=verification(crypto.getRandomValues(new Uint8Array(48)));
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
      const challenge={code_challenge:verification(new Uint8Array(digest)),code_challenge_method:'s256'};
      const redirect='?redirect_to='+encodeURIComponent(redirectTo());
      if(mode==='secure') {
        await authenticate(expected);
        if(!session.anonymous) throw Error('Déjà sécurisé');
        write('link',{verifier,mode,user:session.id,time:Date.now()});
        await request('/auth/v1/user'+redirect,'PUT',{email,...challenge},session.access);
      } else {
        if(current && !current.anonymous && current.until>Date.now()) throw Error('Compte déjà actif');
        write('link',{verifier,mode,time:Date.now()});
        await request('/auth/v1/otp'+redirect,'POST',{email,create_user:false,...challenge});
      }
    });
    account.notice=mode==='secure'
      ? 'Lien envoyé. Ouvre-le dans ce navigateur pour sécuriser ton compte.'
      : 'Si le compte existe, ouvre le lien reçu dans ce navigateur.';
  } catch(error) {
    if(error.status===429) account.notice='Trop de demandes. Réessaie dans un instant.';
    else if(mode==='restore' && error.status && error.status<500) account.notice='Si le compte existe, un lien a été demandé.';
    else account.notice='Envoi impossible. Vérifie la connexion ou réessaie.';
  } finally { account.busy=false; emit(); }
}

export async function changePseudo(pseudo) {
  if(account.busy) return;
  if(!letters.test(pseudo)) {
    account.notice='Utilise 3 à 16 lettres, chiffres, tirets ou underscores.';
    emit(); return;
  }
  account.busy=true;
  account.notice='';
  try {
    if(active) await active;
    const expected=generation;
    await lock('account',async()=>{
      await authenticate(expected);
      const profile=await rpc('rename_profile',{p_pseudo:pseudo});
      if(expected===generation) account.profile=profile;
    });
    account.notice='Pseudo enregistré.';
  } catch(error) {
    account.notice=error.code==='23505' ? 'Ce pseudo est déjà utilisé.' :
      error.code==='22023' ? 'Ce pseudo est réservé ou interdit.' : 'Modification impossible pour le moment.';
  } finally { account.busy=false; emit(); }
}

export function startAccounts() {
  try { callback(); } catch {}
  addEventListener('online',()=>schedule(0));
  addEventListener('offline',()=>{ account.status='offline'; emit(); });
  addEventListener('cendres:save',()=>schedule());
  addEventListener('cendres:reset',()=>{
    generation++;
    session=null; account.profile=null; account.secured=false;
    try { write('session',null); write('link',null); write('device',null); } catch {}
    schedule();
  });
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) schedule(); });
  schedule(0);
}
