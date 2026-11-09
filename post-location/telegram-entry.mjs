import {createMapAdapter} from './map-adapter.mjs';

// Public approximate event location only. This module never handles identity or cookies.
async function publicMapSettings(){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);try{const response=await fetch('https://lubimka-app.netlify.app/api/maps',{credentials:'omit',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Map settings unavailable');return await response.json();}finally{clearTimeout(timer);}}
export function installPostLocation({context,doc=document,win=window,createMap=createMapAdapter,fetchConfig=publicMapSettings,loadFallback}={}){
 if(!context?.get||!context?.setPoint)return null;
 const $=id=>doc.getElementById(id),valid=p=>!!p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=85&&Math.abs(p.lng)<=180;
 const approximate=p=>{if(!valid(p))throw Error('Проверь место на карте');return {lat:Math.round(p.lat*100)/100,lng:Math.round(p.lng*100)/100};};
 let map=null,pending=null,generation=0,geoRequest=0,fallbackPromise;
 const required=()=>{const c=context.get();return !c.editing&&['lost','found','adopt'].includes(c.kind);};
 const fallback=loadFallback||(()=>{if(win.L)return Promise.resolve();if(fallbackPromise)return fallbackPromise;fallbackPromise=new Promise((resolve,reject)=>{const style=doc.createElement('link');style.rel='stylesheet';style.href=new URL('./vendor/leaflet.css',import.meta.url).href;doc.head.append(style);const script=doc.createElement('script');let settled=false;const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(ok)resolve();else{script.remove();fallbackPromise=null;reject(Error('Нет карты'));}};const timer=setTimeout(()=>finish(false),12000);script.src=new URL('./vendor/leaflet.js',import.meta.url).href;script.onload=()=>finish(!!win.L);script.onerror=()=>finish(false);doc.head.append(script);});return fallbackPromise;});
 function refresh(){const c=context.get(),chosen=valid(c.point);$('pfLocationTitle').textContent=required()?'Место на карте · обязательно':'Место на карте';$('pfPickPoint').textContent=chosen?'Изменить место на карте':'Отметить место на карте';$('pfPointNote').textContent=chosen?'Место выбрано. Покажем примерную область, без точного адреса.':required()?'Чтобы люди рядом увидели объявление, отметь примерное место на карте.':'Можно добавить примерное место. Старое объявление сохранится и без точки.';}
 function choose(point){if(!context.get().open)return;const p=approximate(point);context.setPoint(p);map?.setPosts([],{point:p});$('pfPointError').textContent='';refresh();}
 async function open(){
  if(pending)return pending;if(!context.get().open)return;
  const epoch=generation;const c=context.get(),center=valid(c.point)?c.point:{lat:55.75,lng:37.61};
  $('pfMapArea').hidden=false;$('pfPickPoint').disabled=true;$('pfPointError').textContent='';$('pfPointNote').textContent='Загружаем карту… Поля объявления сохранены.';
  pending=(async()=>{try{
   if(!map){let next,config;try{config=await fetchConfig();}catch{config={provider:'osm'};}
    if(epoch!==generation||!context.get().open)return;
    if(config.provider==='yandex'&&typeof config.yandexKey==='string'&&config.yandexKey){try{next=await createMap($('pfMap'),{provider:'yandex',key:config.yandexKey,center,onPoint:choose});}catch{}}
    if(!next){$('pfMap').replaceChildren();await fallback();next=await createMap($('pfMap'),{provider:'osm',center,onPoint:choose});}
    if(epoch!==generation||!context.get().open){next.destroy();return;}map=next;
   }
   map.resize();map.setPosts([],{point:context.get().point});refresh();
  }catch{$('pfPointError').textContent='Карта не загрузилась. Поля сохранены — попробуй открыть карту ещё раз.';}
  finally{pending=null;$('pfPickPoint').disabled=false;}})();return pending;
 }
 function reset(){generation++;geoRequest++;map?.destroy();map=null;$('pfMap').replaceChildren();$('pfMapArea').hidden=true;$('pfPointError').textContent='';$('pfMapLocate').disabled=false;refresh();}
 function close(){generation++;geoRequest++;map?.destroy();map=null;$('pfMap').replaceChildren();$('pfMapArea').hidden=true;}
 $('pfPickPoint').onclick=open;
 $('pfUseCenter').onclick=()=>{if(map)choose(map.getCenter());};
 $('pfMapLocate').onclick=()=>{
  if(!map)return;if(!win.navigator.geolocation){$('pfPointError').textContent='Геолокация недоступна. Передвинь карту вручную.';return;}
  const request=++geoRequest,epoch=generation;$('pfMapLocate').disabled=true;
  win.navigator.geolocation.getCurrentPosition(position=>{if(request!==geoRequest||epoch!==generation||!context.get().open)return;$('pfMapLocate').disabled=false;const p={lat:position.coords.latitude,lng:position.coords.longitude};if(!valid(p))return;map?.setView(p,13);$('pfPointNote').textContent='Карта перемещена к тебе. Теперь выбери место объявления касанием карты или кнопкой «Выбрать центр карты».';},()=>{if(request!==geoRequest||epoch!==generation)return;$('pfMapLocate').disabled=false;$('pfPointError').textContent='Не удалось определить местоположение. Передвинь карту вручную.';},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
 };
 doc.addEventListener('lubimka-post-location-open',reset);doc.addEventListener('lubimka-post-location-close',close);doc.addEventListener('lubimka-post-location-required',open);refresh();
 return {open,choose,reset,close,refresh};
}
if(typeof window!=='undefined'&&window.LubimkaPostLocationContext)installPostLocation({context:window.LubimkaPostLocationContext});
