// Small, opt-in adapter for the existing website and Mini App. No orders or PII leave this module.
export const ZOOTAXI_ENTRY_DEFAULTS=Object.freeze({enabled:false,deploymentRegion:'',ruDeploymentVerified:false,formURL:'https://taxi.lubimka.online/zootaxi'});
const formOrigins=new Set(['https://taxi.lubimka.online','https://lubimka-app.netlify.app']);
const localForm=url=>['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:';
export function taxiLink(base, {source='website', address=''}={}) {
 const url=new URL(base);
 if(!localForm(url)&&!formOrigins.has(url.origin))throw Error('Unapproved zootaxi form origin');
 if(url.username||url.password||url.pathname!=='/zootaxi')throw Error('Invalid zootaxi form URL');
 url.search='';url.hash='';url.searchParams.set('source',source==='telegram'?'telegram':'website');
 if(address)url.hash='clinic='+encodeURIComponent(String(address).slice(0,400));
 return url.href;
}
function entryReady(doc,config) {
 if(config?.enabled!==true)return false;
 let url;try{url=new URL(taxiLink(config.formURL??ZOOTAXI_ENTRY_DEFAULTS.formURL));}catch{return false;}
 if(localForm(url))return doc.defaultView?.location.origin===url.origin;
 return config.deploymentRegion==='RU'&&config.ruDeploymentVerified===true;
}
export function installZootaxi(doc=document, config=window.LubimkaZootaxiConfig) {
 if(!entryReady(doc,config))return false;
 const isWeb=!!doc.querySelector('script[src*="/web/app.mjs"]')||!!doc.getElementById('webHome');
 const source=isWeb?'website':'telegram';
 const home=doc.getElementById(source==='website'?'webHome':'home');
 if(!home)return false;
 const formURL=config.formURL??ZOOTAXI_ENTRY_DEFAULTS.formURL;
 const base=taxiLink(formURL,{source});
 const api={available:true,open({address=''}={}){doc.defaultView.location.assign(taxiLink(formURL,{source,address}));}};
 doc.defaultView.LubimkaZootaxi=api;
 if(!doc.getElementById('zootaxiHomeCard')){
 const link=doc.createElement('a');link.id='zootaxiHomeCard';link.className='zootaxi-home-card';link.href=base;
 const icon=doc.createElement('span');icon.className='zootaxi-home-icon';icon.textContent='↗';icon.setAttribute('aria-hidden','true');
 const copy=doc.createElement('span');const title=doc.createElement('strong');title.textContent='Зоотакси';
 const subtitle=doc.createElement('small');subtitle.textContent='Бережно отвезём любимку. Маршрут, цена и время — по согласованию.';
 copy.append(title,subtitle);link.append(icon,copy);
 const anchor=home.querySelector(source==='website'?'.web-quick-actions':'.premium-hero');
 if(anchor)anchor.after(link);else home.prepend(link);
 }
 const nav=doc.getElementById(source==='website'?'premiumTopNav':'premiumNav');
 if(nav&&!nav.querySelector('[data-zootaxi-nav]')){const button=doc.createElement('button');button.type='button';button.dataset.zootaxiNav='';button.textContent='Зоотакси';button.onclick=()=>api.open();nav.append(button);}
 return source==='website'?!!nav:true;
}
if(typeof document!=='undefined'&&entryReady(document,window.LubimkaZootaxiConfig)){
 if(!installZootaxi()){const observer=new MutationObserver(()=>{if(installZootaxi())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
}
