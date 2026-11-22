import { activeCosmetics } from './cosmetics.js';
import { selectedCharacter } from './meta.js';
import { account, changePseudo, sendAccountLink, synchronize } from './online.js';

const messages={
 loading:'Connexion…',unconfigured:'Connexion en ligne à configurer. Le solo reste disponible.',
 offline:'Hors ligne. Ta progression reste sur cet appareil.',
 error:'Synchronisation indisponible. Ta progression reste sur cet appareil.',
 online:'Progression synchronisée.'
};
const escape=text=>String(text??'').replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]);

export function drawProfile(ui) {
  const {profile,status,secured,busy,notice}=account;
  const disabled=busy?' disabled':'';
  const style=activeCosmetics(selectedCharacter());
  let forms='';
  if(profile) {
    forms='<p>'+(secured?'Compte sécurisé':'Compte invité')+' · Code ami <strong>'+escape(profile.friend_code)+'</strong></p>'+
      '<form class="account-form" data-account="rename"><label>Pseudo <input name="pseudo" minlength="3" maxlength="16" '+
      'autocomplete="off" value="'+escape(profile.pseudo)+'" required></label><button'+disabled+'>Enregistrer</button></form>';
  }
  if((profile && !secured) || status==='error') {
    forms+='<form class="account-form" data-account="email"><label>E-mail <input type="email" name="email" '+
      'autocomplete="email" inputmode="email" maxlength="254" required></label>'+
      (profile && status==='online'?'<button value="secure"'+disabled+'>Sécuriser mon compte</button>':'')+
      '<button value="restore"'+disabled+'>Retrouver mon compte</button>'+
      '<p>Demande le lien sur le téléphone à connecter, puis ouvre-le dans le même navigateur.</p></form>';
  }
  const retry=status==='error' || status==='offline' ? ui.btn('Réessayer','accountRetry') : '';
  const badge=style?.title||style?.frame ? '<p style="border:1px solid '+escape(style.frame?.color??'#696375')+'">'+escape(style.title?.name??profile?.pseudo??'Profil')+'</p>' : '';
  ui.screen('Profil',badge+'<p role="status">'+escape(messages[status])+'</p>'+
    (notice?'<p role="status">'+escape(notice)+'</p>':'')+forms+ui.actions(retry+ui.btn('Retour','m:page:home')));
}

export function bindProfile(panel,refresh) {
  panel.addEventListener('submit',event=>{
    const form=event.target;
    if(!form.dataset.account) return;
    event.preventDefault();
    const fields=new FormData(form);
    if(form.dataset.account==='rename') changePseudo(String(fields.get('pseudo')).trim());
    else sendAccountLink(event.submitter?.value==='secure'?'secure':'restore',String(fields.get('email')).trim());
  });
  addEventListener('cendres:account',()=>{
    const focused=document.activeElement;
    const name=focused?.form?.dataset.account && focused.name;
    const value=name ? focused.value : '';
    refresh();
    if(name) {
      const field=panel.querySelector('input[name="'+name+'"]');
      if(field) { field.value=value; field.focus(); }
    }
  });
}

export function retryProfile() { synchronize(); }
