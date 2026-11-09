// Official Yandex Maps JS API 3.0 only. No geocoder, routing or paid search APIs.
let sdkPromise;
export function loadYandexSDK(key, win=window, doc=document) {
 if(!key) return Promise.reject(Error('Ключ Яндекс Карт ещё не указан в настройках тестового проекта.'));
 if(!sdkPromise) sdkPromise=new Promise((resolve,reject)=>{
  let script,readySDK=win.ymaps3,settled=false;
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(script){script.onload=null;script.onerror=null;}if(error){
   script?.remove();
   // A failed/unfinished global must not trap every manual retry in the same ready promise.
   const failedSDK=readySDK||win.ymaps3;if(failedSDK&&win.ymaps3===failedSDK){try{delete win.ymaps3;}catch{}}
   reject(Error('Яндекс Карты не загрузились. Проверь ключ, доступ к сети и разрешённый HTTP Referer.'));
  }else resolve(readySDK);};
  const timer=setTimeout(()=>finish(true),15000);
  const ready=()=>{readySDK=win.ymaps3;if(!readySDK)return finish(true);Promise.resolve(readySDK.ready).then(()=>finish(false),()=>finish(true));};
  // Even a previously loaded SDK can have a rejected or never-settling ready promise.
  if(readySDK){ready();return;}
  script=doc.createElement('script');
  script.src='https://api-maps.yandex.ru/v3/?'+new URLSearchParams({apikey:key,lang:'ru_RU'});
  script.async=true;script.referrerPolicy='origin';
  script.onload=ready;
  script.onerror=()=>finish(true);doc.head.append(script);
 }).catch(error=>{sdkPromise=null;throw error;});
 return sdkPromise;
}

// Own announcement coordinates only: the circle never changes provider map data.
export function circleRing(point, radius, segments=72) {
 const rad=Math.PI/180,lat=point.lat*rad,lng=point.lng*rad,d=radius/6371008.8,ring=[];
 for(let i=0;i<segments;i++){
  const bearing=2*Math.PI*i/segments;
  const a=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(bearing));
  const b=lng+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(a));
  ring.push([((b/rad+540)%360)-180,a/rad]);
 }
 ring.push([...ring[0]]);return ring;
}
export async function createYandexMap(host,{key,center,zoom,onPoint,moved}, sdkOverride) {
 const sdk=sdkOverride||await loadYandexSDK(key);
 const map=new sdk.YMap(host,{location:{center:[center.lng,center.lat],zoom},zoomRange:{min:3,max:18},behaviors:['drag','pinchZoom','scrollZoom','dblClick'],theme:'light'});
 map.addChild(new sdk.YMapDefaultSchemeLayer());map.addChild(new sdk.YMapDefaultFeaturesLayer());
 let cameraStamp='';
 map.addChild(new sdk.YMapListener({layer:'any',onUpdate:({location,mapInAction})=>{
  if(mapInAction)return;
  const stamp=JSON.stringify([location.center,location.zoom]);if(stamp!==cameraStamp){cameraStamp=stamp;moved();}
 },onResize:()=>moved(),onClick:(object,event)=>{if(object?.type==='marker')return;const p=event?.coordinates;if(p)onPoint({lng:p[0],lat:p[1]});}}));
 const add=item=>{map.addChild(item);return {remove:()=>map.removeChild(item)};};
 return {
  getCenter:()=>({lng:map.center[0],lat:map.center[1]}),getZoom:()=>map.zoom,
  getBounds:()=>{const b=map.bounds;return {west:b[0][0],south:b[0][1],east:b[1][0],north:b[1][1]};},
  // No tilt or rotation: normalized provider projection is enough for pixel clustering.
  project:p=>{const c=map.projection.toWorldCoordinates([p.lng,p.lat]),scale=128*2**map.zoom;return [c.x*scale,-c.y*scale];},
  setView:(p,z)=>map.setLocation({center:[p.lng,p.lat],zoom:z,duration:250}),
  resize:()=>{}, // SDK observes the container with ResizeObserver.
  fit:points=>{if(!points.length)return;const lats=points.map(p=>p.lat),lngs=points.map(p=>p.lng);
   if(Math.max(...lats)-Math.min(...lats)<.001&&Math.max(...lngs)-Math.min(...lngs)<.001){map.setLocation({center:[points[0].lng,points[0].lat],zoom:14});return;}
   map.setLocation({bounds:[[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],duration:250});},
  marker:(point,node)=>{const anchor=document.createElement('div');anchor.className='pet-yandex-anchor';anchor.append(node);return add(new sdk.YMapMarker({coordinates:[point.lng,point.lat],zIndex:100},anchor));},
  circle:(p,r,color)=>add(new sdk.YMapFeature({geometry:{type:'Polygon',coordinates:[circleRing(p,r)]},style:{fill:color+'18',stroke:[{color,width:2}]}})),
  destroy:()=>map.destroy()
 };
}
