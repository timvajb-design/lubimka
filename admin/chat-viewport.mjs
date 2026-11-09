// One active chat owns viewport sizing and page scroll locking. No keyboard-dismiss gestures.
const owners=new WeakMap();
const dialogProperties=['position','inset','top','right','bottom','left','width','min-width','max-width','height','min-height','max-height','margin','box-sizing','overflow','--chat-keyboard-inset','--chat-safe-bottom'];
const bodyProperties=['position','top','left','right','width','overflow','overscroll-behavior'];
const htmlProperties=['overflow','overscroll-behavior','scroll-behavior'];
const listProperties=['overscroll-behavior','-webkit-overflow-scrolling'];
const snapshot=(node,properties)=>properties.map(name=>[name,node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]);
function restore(node,properties,except=''){
 for(const [name,value,priority]of properties){if(name===except)continue;if(value)node.style.setProperty(name,value,priority);else node.style.removeProperty(name);}
}
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const positive=(value,fallback)=>Math.max(1,number(value,fallback));
const px=value=>Math.round(value*100)/100+'px';

export function createChatViewport({dialog,scroller,win=window,doc=dialog?.ownerDocument||document,maxWidth=680,nearBottom=100,followBottom=true}={}){
 if(!dialog?.style||!scroller?.style||!doc.body||!doc.documentElement)throw new TypeError('Chat dialog and scroller are required');
 let active=false,destroyed=false,frame=0,saved=null,anchor=null,baselineHeight=0,resetBaseline=false;
 const listeners=[];
 const listen=(target,type,fn)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,{passive:true});listeners.push([target,type,fn]);};
 function layoutHeight(){return Math.max(positive(win.innerHeight,1),positive(doc.documentElement.clientHeight,1));}
 function editableFocused(){
  const el=doc.activeElement;if(!el||!dialog.contains(el))return false;
  return el.tagName==='TEXTAREA'||el.isContentEditable||el.getAttribute?.('contenteditable')==='true'||el.tagName==='INPUT'&&/^(text|search|email|url|tel|password|number)$/.test(el.type||'text');
 }
 function rememberScroll(){
  if(!active)return;
  const top=Math.max(0,number(scroller.scrollTop)),height=Math.max(0,number(scroller.clientHeight)),total=Math.max(0,number(scroller.scrollHeight));
  anchor={top,bottom:followBottom&&total-height-top<=Math.max(0,nearBottom)};
 }
 function applyViewport(){
  if(!active)return;
  const viewport=win.visualViewport,layout=layoutHeight(),focused=editableFocused();
  if(resetBaseline||!focused){baselineHeight=layout;resetBaseline=false;}
  const height=positive(viewport?.height,layout),width=positive(viewport?.width,positive(win.innerWidth,doc.documentElement.clientWidth||1));
  const top=Math.max(0,number(viewport?.offsetTop)),left=Math.max(0,number(viewport?.offsetLeft));
  const panelWidth=Math.min(width,positive(maxWidth,width));
  const inset=Math.max(0,Math.max(layout,baselineHeight)-(height+top));
  const keyboard=focused&&number(viewport?.scale,1)<=1.1&&inset>80;
  const before=anchor;
  const values={position:'fixed',inset:'auto',top:px(top),right:'auto',bottom:'auto',left:px(left+(width-panelWidth)/2),width:px(panelWidth),'min-width':'0','max-width':px(panelWidth),height:px(height),'min-height':'0','max-height':px(height),margin:'0','box-sizing':'border-box',overflow:'hidden','--chat-keyboard-inset':px(keyboard?inset:0),'--chat-safe-bottom':keyboard?'0px':'env(safe-area-inset-bottom, 0px)'};
  for(const [name,value]of Object.entries(values))dialog.style.setProperty(name,value);
  dialog.setAttribute('data-chat-keyboard',keyboard?'open':'closed');
  if(before){const bottom=Math.max(0,scroller.scrollHeight-scroller.clientHeight);scroller.scrollTop=before.bottom?bottom:Math.min(before.top,bottom);}
  rememberScroll();
 }
 function refresh(){
  if(!active||frame)return;
  frame=win.requestAnimationFrame(()=>{frame=0;applyViewport();});
 }
 function orientation(){resetBaseline=true;refresh();}
 function visibility(){if(!doc.hidden)refresh();}
 function close(){
  if(!active)return;active=false;
  if(frame){win.cancelAnimationFrame(frame);frame=0;}
  for(const [target,type,fn]of listeners.splice(0))target.removeEventListener(type,fn);
  restore(dialog,saved.dialog);restore(scroller,saved.scroller);restore(doc.body,saved.body);restore(doc.documentElement,saved.html,'scroll-behavior');
  for(const [name,value]of saved.attributes){if(value===null)dialog.removeAttribute(name);else dialog.setAttribute(name,value);}
  // Restore the exact page position without inheriting a site's smooth-scroll animation.
  try{win.scrollTo(saved.x,saved.y);}finally{restore(doc.documentElement,saved.html.filter(([name])=>name==='scroll-behavior'));}
  if(owners.get(doc)===controller)owners.delete(doc);
  saved=null;anchor=null;
 }
 function open(){
  if(destroyed)return false;
  if(active){rememberScroll();refresh();return true;}
  const previous=owners.get(doc);if(previous&&previous!==controller)previous.close();
  saved={x:number(win.scrollX),y:number(win.scrollY),dialog:snapshot(dialog,dialogProperties),body:snapshot(doc.body,bodyProperties),html:snapshot(doc.documentElement,htmlProperties),scroller:snapshot(scroller,listProperties),attributes:['data-chat-viewport','data-chat-keyboard'].map(name=>[name,dialog.getAttribute(name)])};
  baselineHeight=layoutHeight();resetBaseline=false;active=true;owners.set(doc,controller);rememberScroll();
  doc.documentElement.style.setProperty('overflow','hidden');doc.documentElement.style.setProperty('overscroll-behavior','none');doc.documentElement.style.setProperty('scroll-behavior','auto');
  for(const [name,value]of Object.entries({position:'fixed',top:px(-saved.y),left:px(-saved.x),right:'0',width:'100%',overflow:'hidden','overscroll-behavior':'none'}))doc.body.style.setProperty(name,value);
  scroller.style.setProperty('overscroll-behavior','contain');scroller.style.setProperty('-webkit-overflow-scrolling','touch');dialog.setAttribute('data-chat-viewport','active');
  listen(win.visualViewport,'resize',refresh);listen(win.visualViewport,'scroll',refresh);listen(win,'resize',refresh);listen(win,'orientationchange',orientation);listen(win,'pageshow',refresh);listen(doc,'visibilitychange',visibility);
  listen(scroller,'scroll',rememberScroll);listen(dialog,'focusin',refresh);listen(dialog,'focusout',refresh);listen(dialog,'close',close);
  applyViewport();return true;
 }
 const controller={open,close,refresh,destroy(){close();destroyed=true;},get active(){return active;}};
 return controller;
}
