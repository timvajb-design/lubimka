// Administrative UI never grants access. Every read and write is authorized by the server.
export function createAdminUI({W,doc,win,viewportFactory,photoURL=()=>'',onPostsChanged=()=>{},onOpenService,styleURL='/web/admin.css',entryHosts,initialView='overview'}){
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,click,cls='')=>{const b=el('button',text,cls);b.type='button';b.onclick=click;return b;};
 const identity=()=>String(W.user?.id??win.Telegram?.WebApp?.initData??'');
 const call=body=>W.request('/api/admin',body);
 const tabsList=[['overview','Обзор'],['posts','Объявления'],['chats','Чаты'],['reports','Жалобы'],['services','Услуги'],['history','История']];
 let allowed=false,capabilities=[],checked='',checkedAt=0,checking=null,shell,body,status,viewport,style,tab=tabsList.some(([key])=>key===initialView)?initialView:'overview',generation=0,offset=0,query='',filter='all',destroyed=false;
 const links=[];
 function syncEntries(){
  const hosts=typeof entryHosts==='function'?entryHosts():entryHosts||[doc.querySelector('.web-profile-links'),doc.querySelector('.web-account-actions'),doc.getElementById('premiumTopNav')];
  for(const host of hosts||[])if(host&&!links.some(b=>b.parentElement===host)){
   const b=button('Управление',()=>open());b.className='web-admin-entry';b.hidden=!allowed;if(!allowed)b.style.setProperty('display','none','important');b.setAttribute('aria-label','Открыть панель администратора');
   if(host.tagName==='NAV'){b.classList.add('web-admin-entry-compact');}else b.append(el('small','Зоотакси, объявления, жалобы и чаты'));
   host.append(b);links.push(b);
  }
 }
 syncEntries();
 function ensureStyle(){if(style)return;style=el('link');style.rel='stylesheet';style.href=styleURL;doc.head.append(style);}
 function hide(){allowed=false;capabilities=[];for(const b of links){b.hidden=true;b.style.setProperty('display','none','important');}if(shell?.open)shell.close();}
 async function refresh(force=false){
  if(destroyed)return false;syncEntries();
  const owner=identity();if(!owner){checked='';hide();return false;}
  if(!force&&checked===owner&&Date.now()-checkedAt<30000)return allowed;
  if(checking?.owner===owner)return checking.promise;
  const promise=(async()=>{try{const r=await call({action:'status'});if(destroyed||owner!==identity())return false;allowed=r.admin===true;capabilities=allowed&&Array.isArray(r.capabilities)?r.capabilities.filter(v=>v==='overview'):[];checked=owner;checkedAt=Date.now();if(allowed)ensureStyle();syncEntries();for(const b of links){b.hidden=!allowed;if(allowed)b.style.removeProperty('display');else b.style.setProperty('display','none','important');}if(!allowed&&shell?.open)shell.close();return allowed;}catch{if(owner===identity())hide();return false;}finally{if(checking?.owner===owner)checking=null;}})();
  checking={owner,promise};return promise;
 }
 function mount(){if(shell)return;
  ensureStyle();
  shell=el('dialog',null,'web-admin');shell.id='webAdmin';shell.setAttribute('aria-labelledby','webAdminTitle');
  const header=el('header',null,'web-admin-header'),brand=el('div'),title=el('h2','Управление Любимкой');title.id='webAdminTitle';brand.append(el('span','Панель администратора','web-admin-eyebrow'),title);header.append(brand,button('Закрыть',()=>shell.close()));
  const tabs=el('nav',null,'web-admin-tabs');tabs.setAttribute('aria-label','Разделы управления');
  for(const [name,label]of tabsList){const b=button(label,()=>selectTab(name));b.dataset.adminTab=name;tabs.append(b);}
  status=el('p',null,'web-admin-status');status.setAttribute('role','status');body=el('div',null,'web-admin-body');shell.append(header,tabs,status,body);doc.body.append(shell);
  viewport=viewportFactory({dialog:shell,scroller:body,maxWidth:1080,followBottom:false});
  shell.addEventListener('close',()=>{generation++;viewport.close();body.replaceChildren();});
 }
 function begin(){const run=++generation,owner=identity();status.textContent='Загружаем…';return ()=>run===generation&&owner===identity()&&shell.open;}
 function error(e){status.textContent=e?.message||'Не удалось загрузить. Попробуй ещё раз.';if(e?.status===401||e?.status===403){hide();}}
 function image(value,title){const src=photoURL(value);if(!src)return null;const n=el('img');n.src=src;n.alt=title||'Фото';n.loading='lazy';n.decoding='async';n.referrerPolicy='no-referrer';n.onerror=()=>n.remove();return n;}
 function date(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('ru-RU'):'';}
 function empty(text){body.append(el('p',text,'web-admin-empty'));}
 function toolbar(){const row=el('form',null,'web-admin-search'),input=el('input');input.type='search';input.placeholder=tab==='posts'?'Название или город':'Найти сообщество';input.setAttribute('aria-label',input.placeholder);input.value=query;
  row.append(input);if(tab==='posts'){const select=el('select');select.setAttribute('aria-label','Статус объявлений');for(const [v,t]of [['all','Все'],['active','Открытые'],['hidden','Скрытые'],['found','Завершённые']]){const option=el('option',t);option.value=v;select.append(option);}select.value=filter;row.append(select);select.onchange=()=>{filter=select.value;offset=0;void load();};}
  const submit=el('button','Найти');submit.type='submit';row.append(submit);row.onsubmit=e=>{e.preventDefault();query=input.value.trim();offset=0;void load();};body.append(row);
 }
 function more(r,fn){if(!r.hasMore)return;const b=button('Показать ещё',()=>fn(r.nextOffset), 'web-admin-more');body.append(b);}
 function selectTab(name){if(!tabsList.some(([key])=>key===name))return;tab=name;offset=0;query='';filter='all';return load();}
 async function open(view=initialView){if(!await refresh(true))return;doc.getElementById('webAccountDialog')?.close();mount();if(!shell.open)shell.showModal();viewport.open();if(tabsList.some(([key])=>key===view))tab=view;offset=0;await load();}
 function taxiPanel(){
  const card=el('section',null,'web-admin-taxi');card.append(el('span','Зоотакси','web-admin-eyebrow'),el('h3','Поездки под контролем'),el('p','Заявки, маршрут, согласованные цена и время, ожидание и статусы поездки — в защищённой очереди зоотакси.'));
  const list=el('ul');for(const text of ['Новая → Подтверждена → Питомец забран → Питомец передан','Отмена заявки и проверка пересечения поездок','Отдельное включение поездок с хозяином и без него'])list.append(el('li',text));card.append(list);
  const note=el('p','Адреса и контакты остаются на российском сервере. Для первого входа открой «Зоотакси» в боте под своим аккаунтом, затем «Управление заявками» внизу формы.','web-admin-muted');card.append(note);
  const actions=el('div',null,'web-admin-actions'),bot=el('a','Открыть в боте','web-admin-link web-primary'),queue=el('a','Очередь · если уже вошёл','web-admin-link');bot.href='https://t.me/lubimkaa1_bot?start=zootaxi';bot.dataset.adminTaxi='';queue.href='https://taxi.lubimka.online/zootaxi/admin';
  for(const link of [bot,queue]){link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}bot.onclick=event=>{if(win.Telegram?.WebApp?.initData&&typeof win.Telegram.WebApp.openTelegramLink==='function'){try{win.Telegram.WebApp.openTelegramLink(bot.href);event.preventDefault();}catch{/* Keep the ordinary link as fallback. */}}};card.append(actions);body.append(card);
 }
 function servicesPanel(){
  taxiPanel();const grid=el('div',null,'web-admin-service-grid');body.append(grid);
  const helped=el('section');helped.append(el('h3','Кому уже помогли'),el('p','Отмечай возвращение домой или найденного хозяина. При необходимости объявление можно вернуть в поиск.'),button('Открыть завершённые',()=>{tab='posts';offset=0;query='';filter='found';void load();}));grid.append(helped);
  const catalog=el('section');catalog.append(el('h3','Магазины и клиники'),el('p','Справочники мест рядом и фотографии магазина. Заказы магазина и записи на приём здесь не ведутся.'));
  if(typeof onOpenService==='function')catalog.append(button('Открыть справочники',()=>{shell.close();onOpenService('catalog');}));else catalog.append(el('p','Открой «Магазины» в основном меню приложения.','web-admin-caption'));grid.append(catalog);
  const stories=el('section');stories.append(el('h3','Истории спасения'),el('p','Публикации о животных, которым помогли. Используется существующий редактор историй «Любимки».'));
  if(typeof onOpenService==='function')stories.append(button('Открыть истории',()=>{shell.close();onOpenService('stories');}));else stories.append(el('p','Открой «Помощь» → «Истории спасения» в приложении.','web-admin-caption'));grid.append(stories);
 }
 async function overview(fresh){
  body.append(el('h3','Всё важное — в одном месте'),el('p','Выбери раздел, чтобы проверить обращения и внести изменения. Каждое действие сохраняется в истории.','web-admin-muted'));
  const grid=el('div',null,'web-admin-overview');body.append(grid);
  const specs=[['posts','Объявления','posts.list',{status:'all',limit:20,offset:0},'posts'],['chats','Сообщества','chat.rooms',{limit:20,offset:0},'rooms'],['reports','Жалобы','chat.reports',{},'reports']];
  const cards=specs.map(([key,label])=>{const b=button(label,()=>selectTab(key),'web-admin-summary');b.append(el('strong','…'),el('small','Загружаем'));grid.append(b);return b;});
  const taxi=button('Зоотакси',()=>selectTab('services'),'web-admin-summary web-admin-summary-taxi');taxi.append(el('strong','↗'),el('small','Заявки, расписание и цена'));grid.append(taxi);
  const full=capabilities.includes('overview');
  const results=await Promise.allSettled([...specs.map(([, ,action,args])=>call({action,...args})),...(full?[call({action:'overview'})]:[])]);
  if(!fresh())return;const denied=results.find(r=>r.status==='rejected'&&[401,403].includes(r.reason?.status));if(denied)throw denied.reason;
  const metrics=results[3]?.status==='fulfilled'?results[3].value:null;
  const count=v=>Number.isSafeInteger(v)&&v>=0?String(v):'—';
  for(let i=0;i<specs.length;i++){const result=results[i],card=cards[i];if(full&&metrics){const values=[metrics.counts?.posts?.active,metrics.counts?.chats?.rooms,metrics.counts?.chats?.openReports];card.querySelector('strong').textContent=count(values[i]);card.querySelector('small').textContent=values[i]==null?'Данные пока недоступны':['Сейчас в поиске','Всего сообществ','Открытых жалоб'][i];continue;}if(result.status==='rejected'){card.querySelector('strong').textContent='—';card.querySelector('small').textContent='Не удалось загрузить · открыть';continue;}const values=result.value?.[specs[i][4]];if(!Array.isArray(values)){card.querySelector('strong').textContent='—';card.querySelector('small').textContent='Нет ответа · повторить';continue;}card.querySelector('strong').textContent=String(values.length)+(result.value.hasMore?' +':'');card.querySelector('small').textContent=result.value.hasMore?'В загруженной выборке · есть ещё':'Загружено сейчас';}
  if(metrics){const stats=el('dl',null,'web-admin-metrics');for(const [label,value]of [['Пользователей',metrics.counts?.users],['Карточек любимок',metrics.counts?.pets],['Уже помогли',metrics.counts?.posts?.found],['Скрыто объявлений',metrics.counts?.posts?.hidden],['Сообщений в чатах',metrics.counts?.chats?.messages]]){const item=el('div');item.append(el('dt',label),el('dd',count(value)));stats.append(item);}body.append(stats);}
  const posts=results[0].status==='fulfilled'&&Array.isArray(results[0].value.posts)?results[0].value.posts:[];
  if(posts.length){body.append(el('h3','Последние объявления'));for(const p of posts.slice(0,3)){const b=button(p.title||'Объявление',()=>{tab='posts';for(const item of shell.querySelectorAll('[data-admin-tab]'))item.setAttribute('aria-current',item.dataset.adminTab===tab?'page':'false');void edit(p.id);},'web-admin-recent');b.append(el('small',[p.city,p.district,p.status==='hidden'?'Скрыто':p.status==='found'?'Уже помогли':'В поиске'].filter(Boolean).join(' · ')));body.append(b);}}
  const quick=el('div',null,'web-admin-actions');quick.append(button('Кому уже помогли',()=>{tab='posts';offset=0;query='';filter='found';void load();}),button('Все услуги',()=>selectTab('services')));body.append(quick);
  body.append(el('p',metrics?'Обновлено: '+(date(metrics.asOf)||'сейчас')+'. «—» означает, что показатель пока не удалось получить.':'В обзоре показана первая страница каждой очереди. Полный список доступен внутри раздела.','web-admin-caption'));
 }
 async function load(append=false){
  if(!shell?.open)return;const fresh=begin();if(!append){body.replaceChildren();body.scrollTop=0;for(const b of shell.querySelectorAll('[data-admin-tab]'))b.setAttribute('aria-current',b.dataset.adminTab===tab?'page':'false');}
  try{
   if(tab==='overview'){await overview(fresh);if(!fresh())return;}
   else if(tab==='services'){servicesPanel();}
   else if(tab==='posts'){
    if(!append)toolbar();const r=await call({action:'posts.list',status:filter,query,limit:20,offset});if(!fresh())return;
    body.querySelector('.web-admin-more')?.remove();for(const p of r.posts||[])postCard(p);if(!(r.posts||[]).length&&!append)empty('Объявлений с такими условиями нет.');more(r,next=>{offset=next;void load(true);});
   }else if(tab==='chats'){
    if(!append)toolbar();const r=await call({action:'chat.rooms',query,limit:20,offset});if(!fresh())return;
    body.querySelector('.web-admin-more')?.remove();for(const room of r.rooms||[]){const b=button(room.title,()=>messages(room));b.className='web-admin-room';b.append(el('small',({cat:'Кошки',dog:'Собаки',bird:'Птицы'})[room.species]||'Сообщество'));body.append(b);}if(!(r.rooms||[]).length&&!append)empty('Сообществ не найдено.');more(r,next=>{offset=next;void load(true);});
   }else if(tab==='reports'){
    const r=await call({action:'chat.reports'});if(!fresh())return;for(const m of r.reports||[])messageCard(m,true,()=>load());if(!(r.reports||[]).length)empty('Жалоб пока нет.');
   }else{const r=await call({action:'history',limit:20});if(!fresh())return;for(const event of r.events||[]){const row=el('article',null,'web-admin-card');row.append(el('strong',({'post.update':'Объявление исправлено','post.hide':'Объявление скрыто','post.restore':'Объявление восстановлено','chat.hide':'Сообщение скрыто','chat.restore':'Сообщение восстановлено','chat.ban':'Участник ограничен','chat.unban':'Ограничение снято','chat.resolve':'Жалоба закрыта'})[event.action]||(event.action==='chat.moderate'?({hide:'Сообщение скрыто',restore:'Сообщение восстановлено',ban:'Участник ограничен',unban:'Ограничение снято',resolve:'Жалоба закрыта'})[event.after?.decision]:'Изменение')),el('small',date(event.createdAt)),el('p',event.reason));body.append(row);}if(!(r.events||[]).length)empty('Здесь будут отображаться твои действия.');}
   if(fresh()){status.textContent='';viewport.refresh();}
  }catch(e){if(fresh()){error(e);if(fresh())body.append(button('Повторить загрузку',()=>load()));}}
 }
 function postCard(p){const row=el('article',null,'web-admin-card'),head=el('div',null,'web-admin-card-head'),photo=image(p.photos?.[0],p.title);if(photo)head.append(photo);const copy=el('div'),hidden=p.hidden===true||p.moderation_hidden===true||p.status==='hidden';copy.append(el('strong',p.title||'Объявление'),el('small',[p.city,p.district].filter(Boolean).join(' · ')),el('span',hidden?'Скрыто':p.status==='active'?'В поиске':'Уже помогли','web-admin-badge'));head.append(copy);row.append(head,el('p',p.description||''));const actions=el('div',null,'web-admin-actions');actions.append(button('Редактировать',()=>edit(p.id)),button(hidden?'Восстановить':'Скрыть',()=>reasonForm(hidden?'post.restore':'post.hide',p,()=>load())));if(!hidden&&['active','found'].includes(p.status))actions.append(button(p.status==='found'?'Вернуть в поиск':'Отметить «Уже помогли»',()=>reasonForm('post.update',p,()=>load(),undefined,{status:p.status==='found'?'active':'found'})));row.append(actions);body.append(row);}
 async function edit(id){const fresh=begin();try{const r=await call({action:'posts.get',id});if(!fresh())return;const p=r.post;status.textContent='';body.replaceChildren(button('← К объявлениям',()=>load()),el('h3','Редактировать объявление'));
   const form=el('form',null,'web-admin-form'),controls={};
   for(const [name,label,max,options]of [['title','Заголовок',200],['kind','Категория',0,{lost:'Потерялся',found:'Найден',adopt:'Ищет дом',boarding:'Передержка'}],['animal_type','Животное',0,{'Кошка':'Кошка','Собака':'Собака','Птица':'Птица','Другое':'Другое'}],['city','Город',120],['district','Район',120],['description','Описание',10000],['contact','Контакт автора',200],['event_date','Дата события',10]]){
    const labelEl=el('label',label),input=el(options?'select':name==='description'?'textarea':'input');if(options)for(const [v,t]of Object.entries(options)){const o=el('option',t);o.value=v;input.append(o);}else{if(name!=='description')input.type=name==='event_date'?'date':'text';input.maxLength=max;}input.name=name;input.value=p[name]||'';input.required=['title','city','description'].includes(name);labelEl.append(input);form.append(labelEl);controls[name]=input;
   }
   const preview=el('div',null,'web-admin-photo-list');for(const src of p.photos||[]){const n=image(src,p.title);if(n)preview.append(n);}form.append(preview);
   if(p.photoCount>0){const showPhotos=button('Показать все фотографии',async()=>{if(!fresh())return;showPhotos.disabled=true;try{const photos=[];for(let index=0;index<Math.min(8,p.photoCount);index++){const result=await call({action:'post.photo',id:p.id,index});if(!fresh())return;const n=image(result.photo,p.title);if(n)photos.push(n);}preview.replaceChildren(...photos);showPhotos.hidden=true;}catch(e){if(fresh())status.textContent=e.message;}finally{showPhotos.disabled=false;}});form.append(showPhotos);}
   const photoLabel=el('label','Заменить фотографии'),file=el('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';photoLabel.append(file);form.append(photoLabel,el('small','Без выбора файла фотографии останутся прежними. Новое фото заменит текущий набор.'));
   let replacement;const photoStatus=el('p');photoStatus.setAttribute('role','status');form.append(photoStatus);
   const reason=el('textarea');reason.name='reason';reason.required=true;reason.minLength=3;reason.maxLength=500;const reasonLabel=el('label','Причина исправления');reasonLabel.append(reason);form.append(reasonLabel);
   const save=el('button','Сохранить изменения','web-primary');save.type='submit';form.append(save);body.append(form);
   file.onchange=async()=>{const f=file.files?.[0];if(!f)return;save.disabled=true;try{if(f.size>10*1024*1024||!/^image\/(jpeg|png|webp)$/.test(f.type))throw Error('Выбери JPG, PNG или WebP до 10 МБ');const url=win.URL.createObjectURL(f);let img;try{img=await new Promise((ok,no)=>{const i=new win.Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('Фото не открылось'));i.src=url;});}finally{win.URL.revokeObjectURL(url);}if(img.width*img.height>50000000)throw Error('Фото слишком большое');const k=Math.min(1,1200/Math.max(img.width,img.height)),canvas=el('canvas');canvas.width=Math.round(img.width*k);canvas.height=Math.round(img.height*k);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);replacement=[canvas.toDataURL('image/jpeg',.78)];preview.replaceChildren();const n=image(replacement[0],p.title);if(n)preview.append(n);photoStatus.textContent='Новое фото подготовлено. Место съёмки удалено.';}catch(e){photoStatus.textContent=e.message;}finally{save.disabled=false;}};
   let lastFingerprint='',mutationId;
   form.onsubmit=async e=>{e.preventDefault();if(!fresh()||!form.reportValidity()||save.disabled)return;const data={};for(const [name,input]of Object.entries(controls)){const value=input.value.trim();if(value!==String(p[name]||''))data[name]=name==='event_date'?(value||null):value;}if(replacement)data.photos=replacement;if(!Object.keys(data).length){status.textContent='Изменений пока нет.';return;}const fingerprint=JSON.stringify([data,reason.value.trim()]);if(fingerprint!==lastFingerprint){mutationId=win.crypto.randomUUID();lastFingerprint=fingerprint;}save.disabled=true;try{await call({action:'post.update',id:p.id,baseVersion:p.version,mutationId,reason:reason.value.trim(),data});if(!fresh())return;onPostsChanged();await load();status.textContent='Изменения сохранены.';}catch(e){if(fresh())error(e);}finally{save.disabled=false;}};
   viewport.refresh();
  }catch(e){if(fresh())error(e);}}
 function reasonForm(action,item,done,decision,patch){const fresh=begin();status.textContent='';body.replaceChildren(button('← Назад',done));const label=decision?({hide:'Скрыть сообщение',restore:'Восстановить сообщение',ban:'Ограничить участника',unban:'Снять ограничение',resolve:'Закрыть жалобу'})[decision]:patch?(patch.status==='found'?'Подтвердить, что уже помогли':'Вернуть в поиск'):action==='post.hide'?'Скрыть объявление':'Восстановить объявление';body.append(el('h3',label),el('p',item.title||item.body||item.author||''));
  const form=el('form',null,'web-admin-form'),reason=el('textarea');reason.name='reason';reason.placeholder='Кратко укажи причину';reason.required=true;reason.minLength=3;reason.maxLength=500;reason.setAttribute('aria-label','Причина действия');const save=el('button',label,'web-primary');save.type='submit';form.append(reason,save);body.append(form);let mutationId=win.crypto.randomUUID(),previous='';
  form.onsubmit=async e=>{e.preventDefault();if(!fresh()||save.disabled||!form.reportValidity())return;if(previous&&previous!==reason.value.trim())mutationId=win.crypto.randomUUID();previous=reason.value.trim();save.disabled=true;try{await call({action,id:item.id,...(decision?{decision}:{baseVersion:item.version}),...(patch?{data:patch}:{}),mutationId,reason:reason.value.trim()});if(!fresh())return;if(!decision)onPostsChanged();await done();status.textContent='Готово.';}catch(e){if(fresh())error(e);}finally{save.disabled=false;}};viewport.refresh();
 }
 async function messages(room,before){const fresh=begin();if(!before)body.replaceChildren(button('← К сообществам',()=>load()),el('h3',room.title));try{const r=await call({action:'chat.messages',room:room.slug,...(before?{before}:{}),limit:30});if(!fresh())return;body.querySelector('.web-admin-more')?.remove();for(const m of r.messages||[])messageCard(m,false,()=>messages(room));if(!r.messages?.length&&!before)empty('Сообщений пока нет.');if(r.hasMore&&r.nextBefore)body.append(button('Более ранние сообщения',()=>messages(room,r.nextBefore),'web-admin-more'));status.textContent='';viewport.refresh();}catch(e){if(fresh())error(e);}}
 function messageCard(m,report,done){const row=el('article',null,'web-admin-card');row.append(el('strong',m.author||'Участник'),el('small',[m.room,date(m.date)].filter(Boolean).join(' · ')),el('p',m.deleted?'Сообщение скрыто':m.body||'Фотография'));const photo=image(m.photoUrl,'Фото сообщения');if(photo&&!m.deleted)row.append(photo);if(report)row.append(el('small','Жалоб: '+Number(m.complaints||1)),el('p',(m.reasons||[]).join(', ')));const actions=el('div',null,'web-admin-actions');if(!m.deleted)actions.append(button('Скрыть',()=>reasonForm('chat.moderate',m,done,'hide')));else if(m.canRestore)actions.append(button('Восстановить',()=>reasonForm('chat.moderate',m,done,'restore')));actions.append(button(m.banned?'Снять ограничение':'Ограничить автора',()=>reasonForm('chat.moderate',m,done,m.banned?'unban':'ban')));if(report)actions.append(button('Закрыть жалобу',()=>reasonForm('chat.moderate',m,done,'resolve')));row.append(actions);body.append(row);}
 function destroy(){destroyed=true;generation++;hide();viewport?.destroy?.();shell?.remove();style?.remove();for(const b of links)b.remove();links.length=0;}
 return {refresh,open,destroy,get allowed(){return allowed;}};
}

// Both applications use the same panel; the host supplies its existing authenticated transport.
export function bootstrapAdmin({api,session,doc=document,win=window,...options}){
 if(typeof api!=='function'||typeof session!=='function')throw new TypeError('Admin API and session accessors are required');
 const W={get user(){return session();},request:(_route,body)=>api(body)};
 return createAdminUI({W,doc,win,...options});
}
