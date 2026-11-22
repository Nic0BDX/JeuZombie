import { account } from './online.js';
import { weapons } from './data/weapons.js';
import { combatHistory,currentCombatResult,loadCombatDetail,loadCombatHistory } from './combat-log.js';

const chars={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escape=value=>String(value??'').replace(/[&<>"']/g,k=>chars[k]);
const format=new Intl.NumberFormat('fr-FR');
const date=new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'});
const num=value=>format.format(Number(value)||0);
const unit=value=>String(value).padStart(2,'0');
const time=value=>{ const n=Math.max(0,Math.floor(Number(value)||0)); return unit(Math.floor(n/60))+':'+unit(n%60); };
const outcome=match=>match.result==='win'?'Victoire':'Défaite';
const name=id=>weapons[id]?.nom??'—';
const btn=(label,action)=>'<button type="button" data-combat="'+escape(action)+'">'+label+'</button>';
const sortNames=['Éliminations','Meilleur temps'];
let detail=null, mode='list', ranking=0, browseGeneration=0;

function damageCurve(values) {
  if(!values?.some(value=>value>0)) return '<p>Aucun dégât enregistré.</p>';
  const max=Math.max(1,...values);
  const coords=values.map((v,i)=>[(i+.5)*100/values.length,100-Number(v)*85/max]);
  let points='';
  for(let i=0;i<coords.length;i++) {
    const [x,y]=coords[i];
    points+='<circle cx="'+x+'" cy="'+y+'" r="1.8"><title>Minute '+(i+1)+' · '+num(values[i])+'</title></circle>';
  }
  return '<svg role="img" aria-label="Courbe des dégâts de l’équipe, maximum '+num(max)+' par minute" width="100%" height="100" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block;background:#272533;border-radius:8px;color:#f0a678">'+
    '<polyline fill="none" stroke="currentColor" vector-effect="non-scaling-stroke" stroke-width="2" points="'+coords.map(point=>point.join(',')).join(' ')+'"/>'+
    '<g fill="currentColor">'+points+'</g></svg><p>Minute 1 à '+values.length+' · Pic '+num(max)+' dégâts</p>';
}

function summary(match) {
  const players=match.players??[];
  const ranked=players.slice().sort((a,b)=>b.damage_dealt-a.damage_dealt||b.kills-a.kills);
  const local=players.find(p=>p.user_id===account.profile?.id)??players[0];
  let body='<p>'+time(match.duration_s)+' · '+num(match.total_kills)+' éliminations · '+num(match.boss_kills)+' boss</p>';
  if(ranked.length>1) body+='<p>MVP · <strong>'+escape(ranked[0].pseudo)+'</strong></p>';
  if(match.sync==='pending') body+='<p>En attente de synchronisation</p>';
  if(match.sync==='rejected') body+='<p>Enregistré sur cet appareil</p>';
  if(players.length) {
    body+='<div style="overflow-x:auto"><table style="width:100%;font-size:14px;text-align:left"><thead><tr><th>Joueur</th><th>Élim.</th><th>Dégâts</th><th>Réanim.</th><th>Cendre</th></tr></thead><tbody>';
    for(const p of players) body+='<tr><th scope="row">'+escape(p.pseudo)+'</th><td>'+num(p.kills)+'</td><td>'+num(p.damage_dealt)+'</td><td>'+num(p.revives)+'</td><td>'+(match.sync==='pending'?'—':num(p.points_earned))+'</td></tr>';
    body+='</tbody></table></div>';
  }
  if(local?.weapons?.length) {
    body+='<h3>Dégâts par arme</h3>';
    for(const w of local.weapons) body+='<label style="display:grid;text-align:left">'+escape(name(w.id))+' · '+num(w.damage)+' <meter min="0" max="'+Math.max(1,Number(local.damage_dealt)||0)+'" value="'+Math.max(0,Number(w.damage)||0)+'" style="width:100%"></meter></label>';
    body+='<p>Niv. '+num(local.level_reached)+' · '+num(local.damage_taken)+' dégâts reçus · '+num(local.heals)+' PV soignés</p>';
  }
  return body+'<h3>Dégâts d’équipe par minute</h3>'+damageCurve(match.damage_by_minute);
}

export function drawCombatResult(ui) {
  const match=currentCombatResult();
  if(!match) return false;
  ui.screen(outcome(match),summary(match)+ui.actions((match.team_size>1 ? btn('Rejouer ensemble','replay') : ui.btn('Rejouer','play','primary'))+ui.btn('Menu','exit')));
  return true;
}

export function drawCombat(ui) {
  if(mode==='detail'&&detail) {
    ui.screen(outcome(detail),summary(detail)+ui.actions(btn('Retour aux combats','back')));
    return;
  }
  const {matches,stats,friends}=combatHistory();
  let content='';
  if(stats) {
    const ratio=stats.deaths ? (stats.revives/stats.deaths).toLocaleString('fr-FR',{maximumFractionDigits:2}) : '—';
    content+='<h3>Statistiques à vie</h3><p>'+num(stats.matches)+' parties · '+num(stats.wins)+' victoires · '+num(stats.kills)+' éliminations</p>'+
      '<p>Temps de jeu '+time(stats.time_s)+' · Record '+time(stats.best_time)+'</p>'+
      '<p>Arme favorite '+escape(name(stats.weapon))+' · Ratio réanimations/morts '+ratio+'</p>';
  }
  if(friends.length>1) {
    const rows=friends.slice().sort((a,b)=>ranking ? b.best_time-a.best_time||b.kills-a.kills : b.kills-a.kills||b.best_time-a.best_time);
    content+='<h3>Classement amis</h3>'+btn(sortNames[ranking]+' ▾','rank')+'<ol>';
    for(const p of rows) content+='<li>'+escape(p.pseudo)+' · '+(ranking?time(p.best_time):num(p.kills))+'</li>';
    content+='</ol>';
  }
  content+='<h3>Derniers combats</h3>';
  if(!matches.length) content+='<p>Aucun combat enregistré.</p>';
  let list='';
  for(const m of matches) {
    const parsed=Date.parse(m.started_at);
    const shown=Number.isFinite(parsed)?date.format(parsed):'';
    const my=m.players?.find(p=>p.user_id===account.profile?.id)??m.players?.[0];
    const points=m.points_earned??my?.points_earned??0;
    list+=btn('<strong>'+outcome(m)+'</strong> · '+shown+' · '+time(m.duration_s)+'<br>'+
      '<small>'+m.team_size+' '+(m.team_size===1?'joueur':'joueurs')+' · '+(m.sync==='pending'?'En attente':num(points)+' Cendres')+'</small>','detail:'+m.id);
  }
  ui.screen('Combats',content+ui.actions(list+ui.btn('Retour','m:page:home')));
}

export function openCombatHistory() {
  browseGeneration++;
  mode='list';
  detail=null;
  loadCombatHistory();
}

export function bindCombat(panel,refresh,showLobby) {
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-combat]');
    if(!button) return;
    const action=button.dataset.combat;
    if(action==='replay') { showLobby(); return; }
    if(action==='back') { browseGeneration++; mode='list'; detail=null; refresh(); return; }
    if(action==='rank') { ranking=1-ranking; refresh(); return; }
    if(!action.startsWith('detail:')) return;
    const current=++browseGeneration;
    button.disabled=true;
    const match=await loadCombatDetail(action.slice(7));
    button.disabled=false;
    if(current!==browseGeneration||!match) return;
    mode='detail';
    detail=match;
    refresh();
  });
  addEventListener('cendres:combat',refresh);
}
