import { createYandexMap } from './yandex-map.mjs';
// The data contract stays in WGS84 public_lat/public_lng for every provider.
export function clusterPosts(posts, project, radius=64) {
 const cells=new Map(),groups=[];
 for(const post of [...posts].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
  if(post.public_lat==null||post.public_lng==null)continue;
  const point={lat:Number(post.public_lat),lng:Number(post.public_lng)};
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))continue;
  const [x,y]=project(point);if(!Number.isFinite(x)||!Number.isFinite(y))continue;
  const cx=Math.floor(x/radius),cy=Math.floor(y/radius);let group;
  for(let dx=-1;dx<=1&&!group;dx++)for(let dy=-1;dy<=1&&!group;dy++)group=(cells.get(`${cx+dx},${cy+dy}`)||[]).find(g=>Math.hypot(g.x-x,g.y-y)<radius);
  if(group)group.posts.push(post);
  else{group={x,y,point,posts:[post]};groups.push(group);const key=`${cx},${cy}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(group);}
 }
 return groups;
}

let sdkPromise;
function mapglSDK(){
 if(window.mapgl)return Promise.resolve(window.mapgl);
 if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://mapgl.2gis.com/api/js/v1';script.referrerPolicy='origin';script.onload=()=>window.mapgl?resolve(window.mapgl):reject(Error('2ГИС не загрузился'));script.onerror=()=>{sdkPromise=null;reject(Error('Не удалось загрузить 2ГИС. Можно вернуться к OpenStreetMap.'));};document.head.append(script);});
 return sdkPromise;
}
export async function createMapAdapter(host,{provider='osm',key='',center={lat:55.75,lng:37.61},zoom=12,onPoint=()=>{},onMove=()=>{}}={}){
 let map,markers=[],circles=[],posts=[],options={},destroyed=false,frame=0;
 const clear=()=>{for(const item of [...markers,...circles])provider==='2gis'?item.destroy():item.remove();markers=[];circles=[];};
 let api;
 const draw=()=>{
  if(destroyed)return;clear();
  for(const group of clusterPosts(posts,api.project)){
   const node=options.marker(group.posts);node.addEventListener('click',e=>{e.stopPropagation();if(group.posts.length===1)options.select(group.posts[0]);else options.cluster(group.posts,()=>api.setView(group.point,Math.min(18,api.getZoom()+2)));});
   if(provider==='yandex')markers.push(map.marker(group.point,node));
   else if(provider==='2gis')markers.push(new window.mapgl.HtmlMarker(map,{coordinates:[group.point.lng,group.point.lat],html:node,anchor:[27,30],interactive:true}));
   else markers.push(window.L.marker([group.point.lat,group.point.lng],{icon:window.L.divIcon({html:node,iconSize:[54,60],iconAnchor:[27,30],className:'pet-map-icon'}),keyboard:false}).addTo(map));
  }
  if(options.area)api.circle(options.area,options.area.radius*1000,'#7c8d62');
  if(options.point)api.circle(options.point,800,'#c76524');
 };
 const moved=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{draw();onMove();});};
 if(provider==='yandex'){
  map=await createYandexMap(host,{key,center,zoom,onPoint,moved});
  api={...map,circle:(p,r,color)=>circles.push(map.circle(p,r,color))};
 }else if(provider==='2gis'){
  if(!key)throw Error('Нужен собственный ключ 2ГИС. Пока доступна OpenStreetMap.');
  const sdk=await mapglSDK();map=new sdk.Map(host,{key,center:[center.lng,center.lat],zoom,pitch:0,rotation:0,zoomControl:false});
  map.on('moveend',moved);map.on('zoomend',moved);map.on('click',e=>{if(e.lngLat)onPoint({lng:e.lngLat[0],lat:e.lngLat[1]});});
  api={getCenter:()=>{const p=map.getCenter();return {lng:p[0],lat:p[1]};},getZoom:()=>map.getZoom(),project:p=>map.project([p.lng,p.lat]),setView:(p,z)=>{map.setCenter([p.lng,p.lat]);map.setZoom(z);},resize:()=>map.invalidateSize(),fit:points=>map.fitBounds({southWest:[Math.min(...points.map(p=>p.lng)),Math.min(...points.map(p=>p.lat))],northEast:[Math.max(...points.map(p=>p.lng)),Math.max(...points.map(p=>p.lat))]},{padding:{top:180,bottom:130,left:60,right:60}}),circle:(p,r,color)=>{circles.push(new sdk.Circle(map,{coordinates:[p.lng,p.lat],radius:r,color:color+'18',strokeColor:color,strokeWidth:2}));}};
 }else{
  const L=window.L;if(!L)throw Error('Не удалось загрузить карту');map=L.map(host,{zoomControl:false}).setView([center.lat,center.lng],zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,referrerPolicy:'origin',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  map.on('moveend zoomend',moved);map.on('click',e=>onPoint(e.latlng));
  api={getCenter:()=>({lat:map.getCenter().lat,lng:map.getCenter().lng}),getBounds:()=>{const b=map.getBounds();return {west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth()};},getZoom:()=>map.getZoom(),project:p=>{const v=map.latLngToContainerPoint([p.lat,p.lng]);return [v.x,v.y];},setView:(p,z)=>map.setView([p.lat,p.lng],z),resize:()=>map.invalidateSize({pan:false}),fit:points=>map.fitBounds(points.map(p=>[p.lat,p.lng]),{paddingTopLeft:[60,180],paddingBottomRight:[60,130],maxZoom:14}),circle:(p,r,color)=>circles.push(L.circle([p.lat,p.lng],{radius:r,color,weight:2,fillOpacity:.06,interactive:false}).addTo(map))};
 }
 let dataStamp='';
 return {...api,provider,setPosts:(next,opts={})=>{const stamp=JSON.stringify([next.map(p=>[p.id,p.version,p.public_lat,p.public_lng,p.title,p.photos?.[0],p.kind]),opts.area,opts.point]);posts=next;options=opts;if(stamp!==dataStamp){dataStamp=stamp;draw();}},destroy:()=>{destroyed=true;cancelAnimationFrame(frame);clear();provider==='osm'?map.remove():map.destroy();}};
}
