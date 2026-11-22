import { social, friendStatus, socialAction, setSocialPlaying } from './social.js';

const escape=text=>String(text??'').replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]);
const labels={online:'En ligne',playing:'En partie',offline:'Hors ligne'};
const button=(label,action,id='')=>'<button type="button" data-social="'+action+'" data-id="'+escape(id)+'">'+label+'</button>';
let copied=false;

export function drawSocial(ui) {
  if(!social.available) {
    ui.screen('Amis','<p>Connecte ton profil pour accéder aux amis.</p>'+ui.actions(ui.btn('Profil','m:page:profile')+ui.btn('Retour','m:page:home')));
    return;
  }
  const room=social.room;
  let rooms='<form data-social-form="join" class="account-form"><label>Code du salon <input name="value" maxlength="4" minlength="4" autocomplete="off" autocapitalize="characters" required></label><button>Rejoindre le salon</button></form>';
  if(room) rooms='<section class="social-room"><h3>Salon '+escape(room.code)+'</h3><p>'+room.members.map(p=>escape(p.pseudo)).join(' · ')+'</p>'+
    '<div class="split">'+button(copied?'Lien copié':'Copier le lien','copy')+button('Quitter','room:leave')+'</div></section>'+rooms;
  else rooms=ui.actions(button('Créer un salon','room:create'))+rooms;
  let friends='';
  for(const p of social.friends) {
    let info='', buttons='';
    if(p.status==='accepted') {
      info=labels[friendStatus(p.id)];
      buttons=button('Inviter','room:invite',p.id)+button('Supprimer','friend:remove',p.id)+button('Bloquer','friend:block',p.id);
    } else if(p.status==='blocked') {
      info='Bloqué'; buttons=button('Débloquer','friend:unblock',p.id);
    } else if(p.incoming) {
      info='Demande reçue'; buttons=button('Accepter','friend:accept',p.id)+button('Refuser','friend:decline',p.id)+button('Bloquer','friend:block',p.id);
    } else {
      info='Demande envoyée'; buttons=button('Annuler','friend:remove',p.id)+button('Bloquer','friend:block',p.id);
    }
    friends+='<li><strong>'+escape(p.pseudo)+'</strong> · '+info+'<div class="social-actions">'+buttons+'</div></li>';
  }
  ui.screen('Amis',(social.message?'<p role="status">'+escape(social.message)+'</p>':'')+rooms+
    '<form data-social-form="request" class="account-form"><label>Pseudo ou code ami <input name="value" maxlength="16" minlength="3" autocomplete="off" required></label><button>Envoyer une demande</button></form>'+
    (friends?'<ul class="social-list">'+friends+'</ul>':'<p>Aucun ami ajouté.</p>')+ui.actions(ui.btn('Retour','m:page:home')));
}

function inviteMarkup() {
  const invite=social.invites[0];
  return invite ? button(escape(invite.pseudo)+' t’invite dans son salon','room:accept',invite.sender)+button('Ignorer','room:dismiss',invite.sender) : '';
}

async function copyRoom() {
  if(!social.room) return;
  const url=new URL('./',location.href);
  url.searchParams.set('salon',social.room.code);
  try { await navigator.clipboard.writeText(url.href); copied=true; }
  catch { if(navigator.share) try { await navigator.share({title:'Les Cendres du Marais',url:url.href}); } catch {} }
}

export function bindSocial(panel,refresh,open) {
  const banner=document.querySelector('#social-banner');
  let queued=false;
  function render() {
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      const markup=inviteMarkup();
      if(banner.innerHTML!==markup) { banner.innerHTML=markup; banner.hidden=!markup; }
      const focused=document.activeElement;
      if(focused?.form?.dataset.socialForm && panel.contains(focused)) return;
      refresh();
    });
  }
  async function click(event) {
    const target=event.target.closest('button[data-social]');
    if(!target || target.disabled) return;
    const [group,action]=target.dataset.social.split(':');
    target.disabled=true;
    if(group==='copy') { await copyRoom(); render(); }
    else {
      const ok=await socialAction(group,action,target.dataset.id);
      if(ok && group==='room' && action==='accept') open();
    }
    target.disabled=false;
  }
  panel.addEventListener('click',click);
  banner.addEventListener('click',click);
  panel.addEventListener('submit',async event=>{
    const form=event.target, action=form.dataset.socialForm;
    if(!action) return;
    event.preventDefault();
    const value=String(new FormData(form).get('value')).trim();
    const focus=document.activeElement;
    if(focus?.form===form) focus.blur();
    const ok=await socialAction(action==='join'?'room':'friend',action,value);
    if(ok && action==='join') open();
    render();
  });
  addEventListener('cendres:social',render);
  addEventListener('cendres:joined',open);
}

export function socialMode(mode) {
  setSocialPlaying(mode==='playing'||mode==='level'||mode==='chest'||mode==='pause');
}
