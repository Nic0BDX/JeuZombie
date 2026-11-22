import { account, socialConnection, socialRpc } from './online.js';
import { weapons } from './data/weapons.js';

const queueKey='cendres-combat-queue-v1', historyKey='cendres-combat-history-v1';
const fresh=()=>({matches:[],stats:null,friends:[]});
const recentLimit=30;
let battle=null, result=null, remote=fresh(), owner=null, sending=false, loading=false;
const read=key=>{ try { return JSON.parse(localStorage.getItem(key))??[]; } catch { return []; } };
const write=(key,data)=>{ try { localStorage.setItem(key,JSON.stringify(data)); } catch {} };
const amount=value=>Number.isFinite(value) ? Math.max(0,Math.round(value)) : 0;
const notify=()=>dispatchEvent(new Event('cendres:combat'));

function newPlayer(profile,character) {
  return {
    user_id:profile.id??null,pseudo:profile.pseudo??'Survivant',character:String(profile.character??character),
    kills:0,damage_dealt:0,damage_taken:0,heals:0,revives:0,deaths:0,level_reached:1,points_earned:0,
    weaponDamage:new Uint32Array(weapons.length),weaponKills:new Uint32Array(weapons.length),equipped:new Uint8Array(weapons.length)
  };
}

export function startCombat(character,options={}) {
  const user=account.profile;
  const roster=options.players?.length ? options.players : [{id:user?.id,pseudo:user?.pseudo,weapon:options.weapon}];
  const start=new Date(options.startedAt??Date.now());
  battle={
    id:options.id??crypto.randomUUID(),host:options.host??user?.id??null,
    started_at:Number.isFinite(start.valueOf())?start.toISOString():new Date().toISOString(),
    difficulty:options.difficulty??'normal',map:options.map??'marais',
    players:roster.map(profile=>newPlayer(profile,character)),damage:new Uint32Array(61)
  };
  for(let i=0;i<roster.length;i++) combatEquip(roster[i].weapon,i);
  result=null;
}

export function combatEquip(weapon,index=0) {
  const player=battle?.players[index];
  if(player && Number.isInteger(weapon) && weapon>=0 && weapon<weapons.length) player.equipped[weapon]=1;
}

export function combatHit(value,weapon=-1,killed=false,index=0,elapsed=0) {
  const player=battle?.players[index];
  if(!player) return;
  const damage=amount(value);
  player.damage_dealt+=damage;
  battle.damage[Math.min(60,Math.max(0,Math.floor(elapsed/60)))]+=damage;
  if(killed) player.kills++;
  if(Number.isInteger(weapon) && weapon>=0 && weapon<weapons.length) {
    player.equipped[weapon]=1;
    player.weaponDamage[weapon]+=damage;
    if(killed) player.weaponKills[weapon]++;
  }
}

export function combatTaken(damage,index=0) {
  const player=battle?.players[index];
  if(player) player.damage_taken+=amount(damage);
}
export function combatHeal(health,index=0) {
  const player=battle?.players[index];
  if(player) player.heals+=amount(health);
}
export function combatRevive(index=0) {
  const player=battle?.players[index];
  if(player) player.revives++;
}
export function combatDeath(index=0) {
  const player=battle?.players[index];
  if(player) player.deaths++;
}
export function combatLevel(level,index=0) {
  const player=battle?.players[index];
  if(player) player.level_reached=Math.max(player.level_reached,amount(level));
}

function finalPlayer(player) {
  const {weaponDamage,weaponKills,equipped,...out}=player;
  out.weapons=[];
  for(let id=0;id<equipped.length;id++) {
    if(equipped[id]) out.weapons.push({id,damage:weaponDamage[id],kills:weaponKills[id]});
  }
  return out;
}

function remember(match) {
  const existing=read(historyKey).filter(entry=>entry.id!==match.id);
  existing.unshift(match);
  write(historyKey,existing.slice(0,recentLimit));
}

export function finishCombat(outcome,elapsed,bossKills,options={}) {
  if(!battle) return result;
  const players=battle.players.map(finalPlayer);
  const duration_s=Math.max(1,amount(elapsed));
  result={
    id:battle.id,host_id:battle.host,started_at:battle.started_at,duration_s,
    result:outcome==='win'||outcome==='won'?'win':'loss',team_size:players.length,difficulty:battle.difficulty,map:battle.map,
    boss_kills:amount(bossKills),total_kills:players.reduce((sum,p)=>sum+p.kills,0),players,
    damage_by_minute:Array.from(battle.damage.subarray(0,Math.min(battle.damage.length,Math.floor(duration_s/60)+1)))
  };
  battle=null;
  if(options.submit!==false) {
    result.sync='pending';
    remember(result);
    const outstanding=read(queueKey);
    if(!outstanding.some(entry=>entry.id===result.id)) outstanding.push(result);
    write(queueKey,outstanding);
    flushCombatQueue();
  }
  return result;
}

export function receiveCombatResult(match) {
  if(!match?.id||!Array.isArray(match.players)) return;
  battle=null;
  result=match;
  remember(match);
  notify();
}
export function currentCombatResult() { return result; }

function mergeServerMatch(match) {
  const found=read(historyKey).find(item=>item.id===match.id);
  if(found) remember({...found,...match,sync:'sent'});
  if(result?.id===match.id) result={...result,...match,sync:'sent'};
}
function localMatches(id) {
  return read(historyKey).filter(match=>!match.host_id ? match.team_size===1 : match.host_id===id||match.players.some(p=>p.user_id===id));
}
export function combatHistory() {
  const id=account.profile?.id;
  const local=localMatches(id);
  const entries=[...remote.matches];
  const ids=new Set(entries.map(x=>x.id));
  for(const match of local) if(!ids.has(match.id)) entries.push(match);
  entries.sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at));
  return {matches:entries.slice(0,recentLimit),stats:remote.stats??localStats(local,id),friends:remote.friends};
}

function localStats(matches,id) {
  const stats={matches:0,wins:0,time_s:0,kills:0,best_time:0,revives:0,deaths:0,weapon:null};
  const counts=new Uint32Array(weapons.length);
  for(const match of matches) {
    const p=match.players.find(player=>player.user_id===id)??(match.team_size===1 ? match.players[0] : null);
    if(!p) continue;
    const duration=amount(match.duration_s);
    stats.matches++;
    stats.wins+=Number(match.result==='win');
    stats.time_s+=duration;
    stats.kills+=p.kills;
    stats.best_time=Math.max(stats.best_time,duration);
    stats.revives+=p.revives;
    stats.deaths+=p.deaths;
    for(const w of p.weapons) {
      counts[w.id]++;
      if(stats.weapon===null||counts[w.id]>counts[stats.weapon]) stats.weapon=w.id;
    }
  }
  return stats;
}

export async function loadCombatHistory() {
  const connection=socialConnection();
  const id=connection?.id??account.profile?.id??null;
  if(owner!==id) { remote=fresh(); owner=id; }
  if(!connection||loading) { notify(); return; }
  loading=true;
  try {
    const data=await socialRpc('combat_history',{});
    if(socialConnection()?.id===id && Array.isArray(data?.matches)) remote=data;
  } catch {} finally { loading=false; notify(); }
}

export async function loadCombatDetail(id) {
  const connection=socialConnection();
  const fallback=localMatches(account.profile?.id).find(item=>item.id===id);
  if(!connection) return fallback;
  try {
    const match=await socialRpc('combat_detail',{p_match:id});
    return socialConnection()?.id===connection.id ? match??fallback : null;
  } catch { return fallback; }
}

async function flushOwned(id) {
  const attempts=new Set();
  for(;;) {
    if(socialConnection()?.id!==id) return;
    const queue=read(queueKey);
    const pending=queue.find(match=>!attempts.has(match.id)&&(match.host_id===id||!match.host_id&&match.team_size===1));
    if(!pending) return;
    attempts.add(pending.id);
    if(!pending.host_id) {
      pending.host_id=id;
      pending.players[0].user_id=id;
      write(queueKey,queue);
      remember(pending);
    }
    let match;
    try {
      match=await socialRpc('submit_match',{p_match:pending});
    } catch(error) {
      if(error.status===400||error.status===403||error.status===409) {
        remember({...pending,sync:'rejected'});
        write(queueKey,read(queueKey).filter(item=>item.id!==pending.id));
        continue;
      }
      return;
    }
    if(socialConnection()?.id!==id) return;
    if(!match?.id) return;
    mergeServerMatch(match);
    dispatchEvent(new CustomEvent('cendres:match-recorded',{detail:match}));
    write(queueKey,read(queueKey).filter(item=>item.id!==pending.id));
  }
}

export async function flushCombatQueue() {
  const connection=socialConnection();
  if(!connection||sending) return;
  sending=true;
  try {
    if(navigator.locks) await navigator.locks.request('cendres-combat-sync',()=>flushOwned(connection.id));
    else await flushOwned(connection.id);
  } finally {
    sending=false;
    notify();
  }
}

export function initCombatSync() {
  addEventListener('cendres:account',()=>{
    const id=account.profile?.id??null;
    if(owner!==id) { remote=fresh(); owner=id; notify(); }
    flushCombatQueue();
  });
  addEventListener('online',()=>flushCombatQueue());
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) flushCombatQueue(); });
}
