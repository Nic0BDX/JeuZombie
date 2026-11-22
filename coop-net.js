import { socialConnection, socialRpc, synchronize } from './online.js';
import { social } from './social.js';

const empty={roomId:null,id:null,local:null,host:null,players:[],difficulty:'normal',map:'marais',startedAt:null,active:false};
export const coop={...empty,error:''};
const iceServers=[{urls:'stun:stun.l.google.com:19302'}];
const links=new Map(), channels=new Map();
let ws, credentials, socketRoom, seq=0, heartbeat='', lastRefresh=0;
let refreshPending=false, dirty=false, launchTimer, reconnectTimer, startKey=null, starting=false, reconnectDelay=1000, offset=0;
let rtcMatch=null, connectionReady=false;
const signal=()=>dispatchEvent(new Event('cendres:coop-change'));
const now=()=>Date.now()+offset;

function message(id,type,payload) {
  dispatchEvent(new CustomEvent('cendres:coop-message',{detail:{id,type,payload}}));
}

function connectionEvent(id,status) {
  dispatchEvent(new CustomEvent('cendres:coop-peer',{detail:{id,status}}));
}

function push(channel,event,payload) {
  if(ws?.readyState!==WebSocket.OPEN) return '';
  const ref=String(++seq);
  ws.send(JSON.stringify([channel?.ref??null,ref,channel?.topic??'phoenix',event,payload]));
  return ref;
}

function sendRelay(id,kind,type,payload) {
  const channel=channels.get(key(coop.local,id));
  if(!connectionReady || !channel?.joined || !coop.id) return false;
  push(channel,'broadcast',{type:'broadcast',event:'coop',payload:{to:id,match:coop.id,kind,type,payload}});
  return true;
}

const key=(from,to)=>from+':'+to;

function peer(id) {
  return id!==coop.local && coop.players.some(p=>p.id===id) && (coop.local===coop.host || id===coop.host);
}

function validPacket(frame) {
  return frame && typeof frame.type==='string' && frame.type.length<=24
    && !frame.type.startsWith('sys:') && frame.match===coop.id;
}

function bindData(link,dc) {
  link.dc=dc;
  dc.onopen=()=>{ if(links.get(link.id)===link) connectionEvent(link.id,'direct'); };
  dc.onmessage=event=>{
    if(links.get(link.id)!==link || typeof event.data!=='string' || event.data.length>58000) return;
    let packet;
    try { packet=JSON.parse(event.data); } catch { return; }
    if(validPacket(packet)) {
      message(link.id,packet.type,packet.payload);
    }
  };
  dc.onclose=()=>{ if(links.get(link.id)===link) connectionEvent(link.id,'relay'); };
}

function createPeer(id) {
  if(!peer(id) || !globalThis.RTCPeerConnection || links.has(id)) return links.get(id);
  let pc;
  try { pc=new RTCPeerConnection({iceServers}); } catch { return null; }
  const link={id,pc,dc:null,queued:[],offering:false,lastOffer:0};
  links.set(id,link);
  pc.onicecandidate=event=>{
    if(event.candidate && links.get(id)===link) sendRelay(id,'signal','ice',event.candidate.toJSON());
  };
  pc.ondatachannel=event=>bindData(link,event.channel);
  return link;
}

async function sendOffer(id) {
  const link=createPeer(id);
  if(!link || link.offering || link.dc?.readyState==='open' || Date.now()-link.lastOffer<1500 || !channels.get(key(id,coop.local))?.joined || !channels.get(key(coop.local,id))?.joined || !connectionReady) return;
  link.lastOffer=Date.now();
  link.offering=true;
  try {
    if(link.pc.localDescription?.type==='offer') {
      sendRelay(id,'signal','offer',link.pc.localDescription.toJSON());
      return;
    }
    if(!link.dc) bindData(link,link.pc.createDataChannel('marais',{ordered:false,maxRetransmits:0}));
    const offer=await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    if(links.get(id)===link) sendRelay(id,'signal','offer',link.pc.localDescription.toJSON());
  } catch { connectionEvent(id,'relay'); }
  finally { link.offering=false; }
}

async function receiveSignal(id,type,value) {
  if(!peer(id) || !value) return;
  if(type==='hello' && coop.local===coop.host) { sendOffer(id); return; }
  const link=createPeer(id);
  if(!link) return;
  const {pc}=link;
  try {
    if(type==='ice') {
      if(typeof value.candidate!=='string' || value.candidate.length>3000) return;
      if(pc.remoteDescription) await pc.addIceCandidate(value);
      else if(link.queued.length<32) link.queued.push(value);
      return;
    }
    if((type!=='offer' && type!=='answer') || value.type!==type || typeof value.sdp!=='string' || value.sdp.length>20000) return;
    if((type==='offer' && id!==coop.host) || (type==='answer' && coop.local!==coop.host)) return;
    if(pc.remoteDescription && type==='answer') return;
    if(type==='offer' && pc.remoteDescription?.sdp===value.sdp && pc.localDescription?.type==='answer') {
      sendRelay(id,'signal','answer',pc.localDescription.toJSON()); return;
    }
    await pc.setRemoteDescription(value);
    for(const item of link.queued) await pc.addIceCandidate(item).catch(()=>{});
    link.queued.length=0;
    if(type==='offer') {
      await pc.setLocalDescription(await pc.createAnswer());
      if(links.get(id)===link) sendRelay(id,'signal','answer',pc.localDescription.toJSON());
    }
  } catch { connectionEvent(id,'relay'); }
}

function closePeers() {
  const old=Array.from(links.values());
  links.clear();
  for(const link of old) { link.dc?.close(); link.pc.close(); }
}

function prepareLinks() {
  if(!coop.id || !connectionReady) return;
  if(rtcMatch!==coop.id) { closePeers(); rtcMatch=coop.id; }
  if(coop.local===coop.host) { for(const p of coop.players) if(p.id!==coop.local) sendOffer(p.id); }
  else if(!coopDirect(coop.host)) sendRelay(coop.host,'signal','hello',{});
}

function receive(raw) {
  if(typeof raw!=='string' || raw.length>64000) return;
  let frame;
  try { frame=JSON.parse(raw); } catch { return; }
  if(!Array.isArray(frame)) return;
  const [join,ref,topic,event,data]=frame;
  if(ref && ref===heartbeat && topic==='phoenix') { heartbeat=''; return; }
  if(typeof topic!=='string') return;
  const channel=channels.get(topic.slice(topic.indexOf(':',14)+1));
  const id=channel?.from;
  if(!channel || channel.topic!==topic || (join && join!==channel.ref)) return;
  if(event==='phx_reply' && ref===channel.ref) {
    channel.joined=data?.status==='ok';
    if(!channel.joined) {
      if(id===coop.local && channel.to===coop.local) ws?.close();
      return;
    }
    if(id===coop.local && channel.to===coop.local) { connectionReady=true; reconnectDelay=1000; }
    prepareLinks();
  } else if(event==='phx_error'||event==='phx_close') {
    channel.joined=false;
    if(id===coop.local && channel.to===coop.local) ws?.close();
  } else if(event==='broadcast' && data?.event==='lobby' && id===coop.local && channel.to===coop.local) {
    refresh();
  } else if(event==='broadcast' && data?.event==='coop') {
    const packet=data.payload;
    if(!packet || packet.match!==coop.id || channel.to!==coop.local || packet.to!==coop.local || !peer(id)) return;
    if(packet.kind==='signal') receiveSignal(id,packet.type,packet.payload);
    else if(packet.kind==='game' && validPacket(packet)) message(id,packet.type,packet.payload);
  }
}

function join(from,to) {
  const pair=key(from,to), topic='realtime:coop:'+coop.roomId+':'+pair, ref=String(++seq);
  channels.set(pair,{from,to,topic,ref,joined:false});
  ws.send(JSON.stringify([ref,ref,topic,'phx_join',{
    config:{private:true,broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[]},
    access_token:credentials.token
  }]));
}

function updateChannels() {
  if(ws?.readyState!==WebSocket.OPEN) return;
  const local=coop.local, keep=new Set([key(local,local)]);
  for(const p of coop.players) if(peer(p.id)) { keep.add(key(local,p.id)); keep.add(key(p.id,local)); }
  for(const [pair,channel] of channels) if(!keep.has(pair)) {
    push(channel,'phx_leave',{});
    channels.delete(pair);
  }
  for(const pair of keep) if(!channels.has(pair)) {
    const [from,to]=pair.split(':');
    join(from,to);
  }
}

function closeSocket() {
  clearTimeout(reconnectTimer);
  const closing=ws;
  ws=null; socketRoom=null; heartbeat=''; connectionReady=false;
  channels.clear();
  if(closing && closing.readyState<WebSocket.CLOSING) closing.close();
}

function route() {
  if(!credentials || !coop.roomId || !globalThis.WebSocket) return;
  if(socketRoom!==coop.roomId) closeSocket();
  if(ws) { updateChannels(); return; }
  const url=new URL('/realtime/v1/websocket',credentials.url);
  url.protocol='wss:';
  url.search=new URLSearchParams({apikey:credentials.key,vsn:'2.0.0'});
  const client=new WebSocket(url);
  ws=client; socketRoom=coop.roomId;
  client.addEventListener('open',()=>{ if(ws===client) updateChannels(); });
  client.addEventListener('message',e=>{ if(ws===client) receive(e.data); });
  client.addEventListener('close',()=>{
    if(ws!==client) return;
    closeSocket();
    reconnectTimer=setTimeout(route,reconnectDelay);
    reconnectDelay=Math.min(10000,reconnectDelay*2);
  });
}

function launch() {
  clearTimeout(launchTimer);
  if(!coop.id || !coop.startedAt || startKey===coop.id || now()-coop.startedAt>12000) return;
  const remaining=coop.startedAt-now();
  if(remaining>0) { launchTimer=setTimeout(launch,remaining); return; }
  startKey=coop.id;
  coop.active=true;
  dispatchEvent(new Event('cendres:coop-start'));
  signal();
}

function apply(state) {
  if(state?.error) { coop.error=String(state.error); signal(); return false; }
  if(!state) {
    if(coop.active) {
      connectionEvent(coop.host,'left');
      if(coop.active) return false;
    }
    clearTimeout(launchTimer);
    closePeers(); closeSocket();
    Object.assign(coop,empty);
    signal();
    return false;
  }
  if(!state.roomId || !Array.isArray(state.players) || state.local!==credentials?.id) return false;
  if(coop.active && coop.id!==state.id) {
    connectionEvent(coop.host,'left');
    if(coop.active) return false;
  }
  const changed=coop.id!==state.id;
  if(changed) { closePeers(); rtcMatch=null; coop.active=false; }
  if(Number.isFinite(state.serverNow)) offset=state.serverNow-Date.now();
  Object.assign(coop,state,{error:''});
  route(); prepareLinks(); launch(); signal();
  return true;
}

async function refresh() {
  if(refreshPending || starting) { dirty=true; return; }
  if(!credentials || !social.room) {
    if(coop.roomId) apply(null);
    return;
  }
  refreshPending=true;
  const accountId=credentials.id;
  try {
    const state=await socialRpc('coop_lobby',{p_action:'state',p_value:{}});
    if(credentials?.id===accountId && !starting) { lastRefresh=Date.now(); apply(state); }
  } catch { if(!coop.active) { coop.error='Salon indisponible.'; signal(); } }
  finally { refreshPending=false; if(dirty) { dirty=false; setTimeout(refresh,80); } }
}

function accountChanged() {
  const next=socialConnection();
  if(!next && !navigator.onLine) return;
  if(credentials?.id!==next?.id) { closeSocket(); closePeers(); }
  else if(next && credentials?.token!==next.token) for(const channel of channels.values()) {
    if(channel.joined) push(channel,'access_token',{access_token:next.token});
  }
  credentials=next;
  refresh();
}

export function startCoopNetwork() {
  addEventListener('cendres:account',accountChanged);
  addEventListener('cendres:social',()=>{
    if(!credentials) return;
    if(!social.room || !coop.roomId || Date.now()-lastRefresh>3500) refresh();
  });
  addEventListener('offline',()=>{ closeSocket(); });
  addEventListener('online',()=>{ accountChanged(); route(); });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden) { accountChanged(); route(); }
  });
  setInterval(()=>{
    if(!credentials || !coop.roomId) return;
    if(credentials.until-Date.now()<85000) synchronize();
    if(ws?.readyState===WebSocket.OPEN) {
      if(heartbeat) ws.close();
      else heartbeat=push(null,'heartbeat',{});
    }
    if(!coop.active) refresh();
    else prepareLinks();
  },19000);
  setInterval(()=>{
    if(!credentials || !social.room || coop.active) return;
    if(coop.startedAt) { signal(); if(now()>=coop.startedAt) launch(); }
    if(Date.now()-lastRefresh>1800) refresh();
  },600);
  accountChanged();
}

export function coopCountdown() {
  return coop.startedAt ? Math.max(0,Math.ceil((coop.startedAt-now())/1000)) : 0;
}

export async function coopAction(action,value={}) {
  if(starting || !credentials || !social.room) return false;
  starting=true;
  let success=false;
  try { success=apply(await socialRpc('coop_lobby',{p_action:action,p_value:value})); }
  catch { coop.error='Action indisponible.'; signal(); }
  finally { starting=false; if(dirty) { dirty=false; refresh(); } }
  return success;
}

export function coopDirect(id) { return links.get(id)?.dc?.readyState==='open'; }

export function sendCoop(id,type,payload) {
  if(!coop.active || !peer(id) || typeof type!=='string' || type.length>24 || type.startsWith('sys:')) return false;
  const dc=links.get(id)?.dc;
  if(dc?.readyState==='open' && dc.bufferedAmount<65536) {
    try { dc.send(JSON.stringify({match:coop.id,type,payload})); return true; } catch {}
  }
  return sendRelay(id,'game',type,payload);
}

export function broadcastCoop(type,payload) {
  if(!coop.active) return;
  if(coop.local!==coop.host) { sendCoop(coop.host,type,payload); return; }
  for(const p of coop.players) if(p.id!==coop.local) sendCoop(p.id,type,payload);
}

export function endCoop() {
  if(!coop.active) return;
  const id=coop.id;
  coop.active=false;
  closePeers();
  signal();
  if(coop.host===coop.local) setTimeout(()=>coopAction('finish',{id}),900);
}
