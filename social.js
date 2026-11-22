import { socialConnection, socialRpc, synchronize } from './online.js';

const empty={friends:[],invites:[],room:null};
export const social={...empty,available:false,message:''};
const presence=new Map();
let identity, auth, playing=false, busy=false, openingCode='', lastRefresh=0, generation=0, refreshing;
const sockets=[null,null];
const signal=()=>dispatchEvent(new Event('cendres:social'));

class Link {
  constructor() {
    this.channels=new Map();
    this.refs=new Map();
    this.socket=null;
    this.counter=0;
    this.heartbeat='';
    this.reconnect=0;
  }
  send(channel,event,payload,topic=channel?.topic ?? 'phoenix') {
    if(this.socket?.readyState!==WebSocket.OPEN) return '';
    const ref=String(++this.counter);
    this.socket.send(JSON.stringify([channel?.ref ?? null,ref,topic,event,payload]));
    return ref;
  }
  open() {
    if(this.socket || !auth || !this.channels.size || document.hidden) return;
    const url=new URL('/realtime/v1/websocket',auth.url);
    url.protocol='wss:';
    url.search=new URLSearchParams({apikey:auth.key,vsn:'2.0.0'});
    const ws=new WebSocket(url);
    this.socket=ws;
    ws.addEventListener('open',()=>{
      if(this.socket!==ws) return;
      for(const channel of this.channels.values()) this.join(channel);
    });
    ws.addEventListener('message',event=>{ if(this.socket===ws) this.receive(event.data); });
    ws.addEventListener('close',()=>{
      if(this.socket!==ws) return;
      this.close();
      this.reconnect=setTimeout(()=>this.open(),3500);
    });
  }
  close() {
    clearTimeout(this.reconnect);
    const ws=this.socket;
    this.socket=null;
    if(ws && ws.readyState<WebSocket.CLOSING) ws.close();
    for(const c of this.channels.values()) {
      presence.delete(c.id);
      c.state.clear();
      c.joined=false;
    }
    this.refs.clear();
    this.heartbeat='';
    signal();
  }
  join(c) {
    const ref=String(++this.counter);
    c.ref=ref; c.joined=false;
    this.refs.set(ref,c);
    this.socket.send(JSON.stringify([ref,ref,c.topic,'phx_join',{
      config:{private:true,broadcast:{ack:false,self:false},presence:{key:identity,enabled:true},postgres_changes:[]},
      access_token:auth.token
    }]));
  }
  add(id) {
    if(this.channels.has('realtime:social:'+id)) return;
    const c={id,topic:'realtime:social:'+id,ref:'',joined:false,state:new Map()};
    this.channels.set(c.topic,c);
    if(this.socket?.readyState===WebSocket.OPEN) this.join(c);
  }
  remove(id) {
    const key='realtime:social:'+id,c=this.channels.get(key);
    if(!c) return;
    if(c.ref) this.send(c,'phx_leave',{});
    this.refs.delete(c.ref);
    this.channels.delete(key); presence.delete(id);
    if(!this.channels.size) this.close();
  }
  track(c) {
    this.send(c,'presence',{type:'presence',event:'track',payload:{status:playing?'playing':'online'}});
  }
  token() {
    for(const c of this.channels.values()) if(c.joined) this.send(c,'access_token',{access_token:auth.token});
  }
  receive(raw) {
    let frame;
    try { frame=JSON.parse(raw); } catch { return; }
    if(!Array.isArray(frame)) return;
    const [joinRef,ref,topic,event,body]=frame;
    if(ref && ref===this.heartbeat) { this.heartbeat=''; return; }
    const c=this.channels.get(topic);
    if(!c || joinRef && joinRef!==c.ref) return;
    if(event==='phx_reply' && this.refs.get(ref)===c) {
      this.refs.delete(ref);
      c.joined=body.status==='ok';
      if(c.joined && c.id===identity) { this.track(c); refreshSocial(); }
    } else if(event==='phx_close'||event==='phx_error') {
      c.state.clear(); presence.delete(c.id); signal();
      c.joined=false;
      if(c.id===identity) this.socket?.close();
    } else if(event==='broadcast' && c.id===identity && body.event==='changed') refreshSocial();
    else if(event==='presence_state'||event==='presence_diff') {
      if(event==='presence_state') c.state.clear();
      for(const meta of (event==='presence_state'?body:body.joins)?.[c.id]?.metas??[]) c.state.set(meta.phx_ref,meta.status);
      if(event==='presence_diff') for(const meta of body.leaves?.[c.id]?.metas??[]) c.state.delete(meta.phx_ref);
      let status=c.state.size?'online':'offline';
      for(const value of c.state.values()) if(value==='playing') { status='playing'; break; }
      presence.set(c.id,status); signal();
    }
  }
  beat() {
    if(this.socket?.readyState!==WebSocket.OPEN) return;
    if(this.heartbeat) this.socket.close();
    else this.heartbeat=this.send(null,'heartbeat',{});
  }
}

function route() {
  if(!auth || document.hidden) return;
  const desired=[identity,...social.friends.filter(p=>p.status==='accepted').map(p=>p.id)];
  for(let i=0;i<2;i++) {
    const ids=desired.slice(i*90,(i+1)*90);
    const link=sockets[i]??=new Link();
    for(const c of link.channels.values()) if(!ids.includes(c.id)) link.remove(c.id);
    for(const id of ids) link.add(id);
    if(ids.length) link.open();
  }
}

function apply(data) {
  if(data?.error) { social.message=data.error; signal(); return false; }
  if(!Array.isArray(data?.friends)) return false;
  social.friends=data.friends; social.invites=data.invites; social.room=data.room;
  route(); signal(); return true;
}

async function refreshSocial() {
  if(!auth || refreshing || busy) return;
  const current=generation;
  refreshing=true;
  try {
    const result=await socialRpc('social_state',{});
    if(generation===current && !busy) { apply(result); lastRefresh=Date.now(); }
  } catch { if(generation===current) { social.message='Service Amis indisponible.'; signal(); } }
  finally { refreshing=false; }
}

async function checkAccount() {
  const connection=socialConnection();
  if(!connection || !navigator.onLine) {
    if(auth) {
      generation++; auth=identity=null; Object.assign(social,empty,{available:false,message:''});
      for(const link of sockets) { link?.close(); link?.channels.clear(); }
      signal();
    }
    return;
  }
  const switched=identity!==connection.id, newToken=auth?.token!==connection.token;
  auth=connection;
  if(switched) {
    generation++; identity=connection.id;
    Object.assign(social,empty,{available:true,message:''});
    for(const link of sockets) { link?.close(); link?.channels.clear(); }
  }
  route();
  if(newToken) for(const link of sockets) link?.token();
  if(openingCode) {
    const code=openingCode;
    openingCode='';
    if(await socialAction('room','join',code)) dispatchEvent(new Event('cendres:joined'));
  } else if(switched || Date.now()-lastRefresh>25000) refreshSocial();
}

export function friendStatus(id) { return presence.get(id)??'offline'; }
export function setSocialPlaying(value) {
  if(playing===value) return;
  playing=value;
  const link=sockets[0], c=link?.channels.get('realtime:social:'+identity);
  if(c?.joined) link.track(c);
}
export function startSocial() {
  const url=new URL(location.href), code=url.searchParams.get('salon')?.toUpperCase();
  if(/^[A-Z2-9]{4}$/.test(code??'')) {
    openingCode=code;
    url.searchParams.delete('salon'); history.replaceState(null,'',url);
  }
  addEventListener('cendres:account',checkAccount);
  addEventListener('offline',checkAccount);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) for(const link of sockets) link?.close();
    else if(auth) { route(); refreshSocial(); }
  });
  setInterval(()=>{
    if(document.hidden || !auth) return;
    for(const link of sockets) link?.beat();
    if(auth.until-Date.now()<90000) synchronize();
    else refreshSocial();
  },18000);
}

export async function socialAction(group,action,value='') {
  if(!auth || busy) return false;
  busy=true; social.message='';
  const current=generation;
  try {
    const result=await socialRpc('social_'+group,{p_action:action,p_value:value});
    return current===generation && apply(result);
  } catch(error) {
    if(current===generation) social.message=error.code==='P0001' ? (error.detail??'Action indisponible.') : 'Action indisponible.';
    return false;
  } finally { busy=false; signal(); }
}
