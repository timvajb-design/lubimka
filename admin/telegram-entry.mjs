import {bootstrapAdmin} from './admin.mjs';
import {createChatViewport} from './chat-viewport.mjs';

// Reuse Mini App authentication. Neither the user ID nor visible buttons grant access.
export function installTelegramAdmin({doc=document,win=window,context=win.LubimkaAdminContext,bootstrap=bootstrapAdmin,viewportFactory=createChatViewport}={}){
 if(!context||typeof context.api!=='function'||typeof context.session!=='function')return null;
 const profile=doc.getElementById('about');if(!profile)return null;
 if(win.LubimkaAdminPanel)return win.LubimkaAdminPanel;
 let holder=doc.getElementById('miniAdminProfileEntry');
 if(!holder){holder=doc.createElement('div');holder.id='miniAdminProfileEntry';const firstCard=profile.querySelector('.card');if(firstCard)firstCard.after(holder);else profile.prepend(holder);}
 const style=doc.createElement('link');style.rel='stylesheet';style.href=new URL('./telegram.css',import.meta.url).href;doc.head.append(style);
 const ui=bootstrap({
  api:body=>context.api(body),
  session:()=>context.session(),doc,win,viewportFactory,
  photoURL:context.photoURL,
  onPostsChanged:context.onPostsChanged,
  onOpenService:context.onOpenService,
  styleURL:new URL('./admin.css',import.meta.url).href,
  entryHosts:[holder,doc.getElementById('premiumNav')].filter(Boolean),
  initialView:'overview'
 });
 let destroyed=false;
 const refresh=force=>{if(!destroyed)void Promise.resolve(ui.refresh(force)).catch(()=>{});};
 const sessionChanged=()=>refresh(false),visible=()=>{if(!doc.hidden)refresh(true);},pageshow=()=>refresh(true);
 doc.addEventListener('lubimka-admin-session',sessionChanged);
 doc.addEventListener('visibilitychange',visible);win.addEventListener('pageshow',pageshow);
 const controller={open:view=>ui.open(view),refresh:force=>ui.refresh(force),get allowed(){return ui.allowed;},destroy(){if(destroyed)return;destroyed=true;doc.removeEventListener('lubimka-admin-session',sessionChanged);doc.removeEventListener('visibilitychange',visible);win.removeEventListener('pageshow',pageshow);ui.destroy?.();style.remove();if(win.LubimkaAdminPanel===controller)delete win.LubimkaAdminPanel;}};
 win.LubimkaAdminPanel=controller;refresh(false);return controller;
}
if(typeof document!=='undefined'&&typeof window!=='undefined')installTelegramAdmin();
