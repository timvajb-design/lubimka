import {KINDS,ICONS,contactURL,placementState,safePicture,money,escapeHTML as e} from './domain.mjs';

const screen=document.getElementById('shop');
if(screen)mount();
function mount(){
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./market.css',import.meta.url);document.head.append(css);
 const legacy=document.createElement('details');legacy.className='lm-legacy';
 const summary=document.createElement('summary');summary.textContent='🧶 Магазин Любимки · игрушки ручной работы';legacy.append(summary);
 while(screen.firstChild)legacy.append(screen.firstChild);
 screen.append(legacy);
 const root=document.createElement('section');root.className='lm';root.setAttribute('aria-label','Магазины и услуги');
 root.innerHTML=`<div class="lm-hero"><span class="lm-hero-mark" aria-hidden="true">🐾</span><div class="lm-eyebrow">Рядом с любимыми</div><h2>Всё для счастливых лап</h2><p>Магазины, груминг и ветклиники. Выбирай и связывайся с продавцом напрямую.</p></div>
 <div class="lm-topline"><h3>Магазины и услуги</h3><button class="lm-link" data-action="mine">Мой бизнес</button></div>
 <div class="lm-tabs" role="group" aria-label="Категория"><button class="lm-tab" data-kind="" aria-pressed="true">Все</button><button class="lm-tab" data-kind="store" aria-pressed="false">Магазины</button><button class="lm-tab" data-kind="grooming" aria-pressed="false">Груминг</button><button class="lm-tab" data-kind="vet" aria-pressed="false">Ветклиники</button></div>
 <div class="lm-search"><input type="search" id="lmQuery" maxlength="100" aria-label="Поиск товара, магазина или услуги" placeholder="Товар, магазин, услуга"><input type="search" id="lmCity" maxlength="100" aria-label="Город" placeholder="Город"></div>
 <div id="lmCatalog" class="lm-grid" aria-live="polite"></div>
 <div class="lm-partner"><h4>У вас бизнес для питомцев?</h4><p>Создайте витрину с товарами или услугами. Покупатели смогут связаться с вами напрямую.</p><div class="lm-row"><div class="lm-price">3 000 ₽ <small>/ месяц</small></div><button class="lm-btn secondary" data-action="create">Разместиться</button></div></div>
 <p class="lm-note">Наличие, запись, оплату и доставку согласовывай с продавцом. Любимка помогает вам найти друг друга.</p>`;
 screen.prepend(root);
 try{titles.shop='Магазины';}catch{}
 const nav=document.querySelector('.nav [data-screen="shop"]');if(nav){for(const node of nav.childNodes)if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim())node.textContent='Магазины';}
 const dialog=document.createElement('dialog');dialog.className='lm-dialog';dialog.setAttribute('aria-labelledby','lmDialogTitle');
 dialog.innerHTML='<header class="lm-dialog-head"><h2 id="lmDialogTitle"></h2><button class="lm-close" aria-label="Закрыть">×</button></header><div class="lm-dialog-body"></div>';document.body.append(dialog);
 const body=dialog.querySelector('.lm-dialog-body'),catalog=root.querySelector('#lmCatalog');
 dialog.querySelector('.lm-close').onclick=()=>dialog.close();
 let kind='',loadVersion=0,searchTimer,mine=[],admin=false,adminRows=[];
 const pending=new Map();
 const show=(title,html)=>{dialog.querySelector('h2').textContent=title;body.innerHTML=html;if(!dialog.open)dialog.showModal();dialog.scrollTop=0;};
 const errorBox=message=>`<p class="lm-error" role="alert">${e(message)}</p>`;
 async function request(action,data={},meta={}){
   const command={type:'market.'+action,...meta,data};
   const write=['save','pause','admin.review','admin.payment'].includes(action);
   const fingerprint=JSON.stringify(command);
   if(write){if(!pending.has(fingerprint))pending.set(fingerprint,crypto.randomUUID());command.mutationId=pending.get(fingerprint);}
   try{
     let result;
     const web=window.LubimkaWeb;
     if(web&&!['catalog','detail'].includes(action)){
       await web.ready;
       if(!web.user){dialog.close();web.open();const error=Error('Войди в аккаунт, чтобы разместить бизнес.');error.status=401;throw error;}
       result=await web.request('/api/community',command);
     }else{
       const telegram=window.Telegram?.WebApp;
       if(!['catalog','detail'].includes(action)&&!telegram?.initData){const error=Error('Для размещения открой Любимку через Telegram.');error.status=401;throw error;}
       const headers={'Content-Type':'application/json'};
       if(telegram?.initData)headers['x-telegram-init-data']=telegram.initData;
       if(typeof SB_KEY==='string'&&SB_KEY)headers.apikey=SB_KEY;
       const response=await fetch('https://aidcgtpxuqlxxmtupvmb.supabase.co/functions/v1/lubimka-community',{method:'POST',headers,body:JSON.stringify(command),signal:AbortSignal.timeout(25000)});
       result=await response.json();if(!response.ok){const error=Error(result.error||'Не удалось выполнить запрос');error.status=response.status;throw error;}
     }
     pending.delete(fingerprint);return result;
   }catch(error){if(error.status&&error.status<500)pending.delete(fingerprint);if(error.name==='TimeoutError'||error.name==='AbortError')throw Error('Ответ задерживается. Повтори действие — оно не создаст дубль.');throw error;}
 }
 const picture=(photo,kind,cls='lm-thumb')=>safePicture(photo)?`<img class="${cls}" src="${e(safePicture(photo))}" alt="" loading="lazy">`:`<span class="${cls}" aria-hidden="true">${ICONS[kind]||'🐾'}</span>`;
 function publicCard(m){return `<article class="lm-card"><button class="lm-card-main" data-detail="${e(m.id)}">${picture(m.photo,m.kind)}<div class="lm-card-copy"><span class="lm-meta">${e(KINDS[m.kind])} · ${e(m.city)}</span><h4>${e(m.name)}</h4><p>${e(m.description)}</p><p>${m.kind==='store'?'Товары':'Услуги'}: ${m.itemCount} · Открыть →</p></div></button></article>`;}
 async function load(){
   const seq=++loadVersion;catalog.setAttribute('aria-busy','true');catalog.innerHTML='<p class="lm-note">Загружаем витрины…</p>';
   try{const result=await request('catalog',{kind,query:root.querySelector('#lmQuery').value.trim(),city:root.querySelector('#lmCity').value.trim()});if(seq!==loadVersion)return;
     const rows=result.merchants||[];
     const filtered=kind||root.querySelector('#lmQuery').value||root.querySelector('#lmCity').value;
     catalog.innerHTML=rows.length?rows.map(publicCard).join(''):`<div class="lm-empty"><div class="lm-empty-icon" aria-hidden="true">${filtered?'🔎':'🌱'}</div><h4>${filtered?'Пока ничего не нашлось':'Здесь появятся наши партнёры'}</h4><p>${filtered?'Попробуй другой город или категорию.':'Приглашаем магазины, грумеров и ветклиники. Станьте первым партнёром в своём городе.'}</p><button class="lm-btn secondary" data-action="${filtered?'reset':'create'}">${filtered?'Сбросить фильтры':'Добавить свой бизнес'}</button></div>`;
   }catch(error){if(seq===loadVersion)catalog.innerHTML=`<div class="lm-empty"><h4>Не удалось загрузить витрины</h4>${errorBox(error.message)}<button class="lm-btn secondary" data-action="reload">Попробовать ещё раз</button></div>`;}
   finally{if(seq===loadVersion)catalog.removeAttribute('aria-busy');}
 }
 function contactLink(d,item){
   const href=contactURL(d.contact);if(!href)return '';
   const verb=d.kind==='store'?'Заказать':'Записаться';
   return `<a class="lm-btn" href="${e(href)}" ${href.startsWith('https:')?'target="_blank" rel="noopener noreferrer"':''}>${verb}${item?'':' у продавца'} ↗</a>`;
 }
 function detailHTML(m,{review=false}={}){
   const d=m.data;
   return `${safePicture(d.photo)?picture(d.photo,d.kind,'lm-detail-cover'):''}<div class="lm-meta">${e(KINDS[d.kind])} · ${e(d.city)}</div><h3 class="lm-detail-name">${e(d.name)}</h3>${d.address?`<p class="lm-note">📍 ${e(d.address)}</p>`:''}<p class="lm-description">${e(d.description)}</p>${review?'':contactLink(d)}<div class="lm-products">${d.items.map(item=>`<article class="lm-product">${safePicture(item.photo)?`<img src="${e(safePicture(item.photo))}" alt="${e(item.name)}" loading="lazy">`:''}<h4>${e(item.name)}</h4><p>${e(item.description)}</p><div class="lm-row"><strong class="lm-price">${money(item.price)}</strong>${review?'':contactLink(d,item)}</div></article>`).join('')}</div><p class="lm-note">Контакт: ${e(d.contact)}\n${d.kind==='store'?'Назови продавцу выбранный товар. Наличие, оплату и доставку согласуйте в переписке или по телефону.':'При обращении назови выбранную услугу. Время, итоговую стоимость и оплату согласуйте с организацией.'}</p>${review?'':`<a class="lm-link" href="https://t.me/ka4evo420" target="_blank" rel="noopener noreferrer">Сообщить о проблеме с карточкой</a>`}`;
 }
 async function detail(id){show('Витрина','<p class="lm-note">Загружаем…</p>');try{const result=await request('detail',{}, {id});show('Магазины и услуги',detailHTML(result.merchant));}catch(error){body.innerHTML=errorBox(error.message);}}
 function loginMessage(error){return errorBox(error.message)+(!window.LubimkaWeb?'<a class="lm-btn" href="https://t.me/lubimkaa1_bot/app" target="_blank" rel="noopener noreferrer">Открыть Любимку в Telegram</a>':'');}
 async function owner(create=false){
   show('Мой бизнес','<p class="lm-note">Загружаем кабинет…</p>');
   try{const result=await request('mine');mine=result.merchants||[];admin=result.admin===true;if(create){editor();return;}renderOwner();}
   catch(error){body.innerHTML=loginMessage(error);}
 }
 function ownerCard(m,moderator=false){
   const state=placementState(m),active=m.status==='approved'&&Date.parse(m.paid_until)>Date.now();
   return `<article class="lm-owner-card"><div class="lm-row"><span class="lm-meta">${e(KINDS[m.data.kind])} · ${e(m.data.city)}</span><span class="lm-badge ${state.tone}">${state.label}</span></div><h3>${e(m.data.name)}</h3>${m.paid_until?`<p class="lm-note">Оплаченное размещение до ${new Date(m.paid_until).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})}</p>`:''}${m.review_note?`<p class="lm-review">${e(m.review_note)}</p>`:''}${m.status==='approved'&&!active?'<p class="lm-note">Карточка одобрена. Для публикации согласуй оплату размещения с Любимкой.</p>':''}<div class="lm-owner-actions">${moderator?`<button class="lm-btn secondary" data-review="${e(m.id)}">Проверить карточку</button>`:`<button class="lm-btn secondary" data-edit="${e(m.id)}">Редактировать</button>${m.status!=='paused'?`<button class="lm-btn secondary" data-pause="${e(m.id)}">Скрыть</button>`:''}${m.status==='approved'?'<a class="lm-btn" href="https://t.me/ka4evo420" target="_blank" rel="noopener noreferrer">Согласовать оплату ↗</a>':''}`}</div><p class="lm-error" role="alert"></p></article>`;
 }
 function renderOwner(){show('Мой бизнес',`<p class="lm-note">Одна витрина или точка — 3 000 ₽ в месяц. Сначала проверка карточки, затем оплата размещения по согласованию. Автоматических списаний нет.</p><button class="lm-btn full" data-action="new">+ Добавить бизнес</button>${admin?'<button class="lm-link" data-action="admin">Проверка размещений</button>':''}${mine.length?mine.map(m=>ownerCard(m)).join(''):'<div class="lm-empty" style="margin-top:16px"><h4>Первая витрина начинается здесь</h4><p>Добавь бизнес, фотографии и до 20 товаров или услуг.</p></div>'}`);}
 async function upload(file){
   if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>12*1024*1024)throw Error('Выбери JPG, PNG или WebP размером до 12 МБ.');
   const bitmap=await createImageBitmap(file);
   try{const scale=Math.min(1,600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',.76);if(image.length>300000)throw Error('Фото слишком подробное. Попробуй обрезать его или выбрать другое.');return image;}finally{bitmap.close();}
 }
 function editor(merchant=null){
   const d=merchant?structuredClone(merchant.data):{kind:'store',name:'',city:'',address:'',description:'',contact:'',photo:null,items:[{name:'',description:'',price:'',photo:null}]};
   let photo=d.photo,items=d.items,uploads=0;
   const field=(label,name,max,placeholder='',required=true)=>`<label>${label}<input name="${name}" maxlength="${max}" value="${e(d[name])}" placeholder="${e(placeholder)}" ${required?'required':''}></label>`;
   show(merchant?'Редактировать витрину':'Добавить бизнес',`<form class="lm-form" id="lmEditor"><p class="lm-note">Размещение — 3 000 ₽ в месяц после одобрения. Заполни карточку, чтобы отправить её на проверку.</p><label>Категория<select name="kind">${Object.entries(KINDS).map(([key,label])=>`<option value="${key}" ${key===d.kind?'selected':''}>${label}</option>`).join('')}</select></label>${field('Название','name',100,'Например, Лапки и хвосты')}${field('Город','city',100,'Например, Москва')}${field('Адрес или условия доставки','address',200,'Улица и дом / доставка по России',false)}<label>О бизнесе<textarea name="description" minlength="10" maxlength="1500" required placeholder="Что у вас можно купить или какие услуги получить">${e(d.description)}</textarea></label>${field('Контакт для покупателей','contact',100,'@имя в Telegram или +79991234567')}<small>Контакт и содержимое карточки будут доступны всем после публикации.</small><label>Фото бизнеса<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"><span id="lmCover">${safePicture(photo)?`<img class="lm-item-photo" src="${e(photo)}" alt="Фото бизнеса">`:''}</span></label><button type="button" class="lm-link" id="lmRemoveCover">Убрать фото бизнеса</button><div class="lm-row"><h3>Товары или услуги</h3><small>До 20 позиций</small></div><div id="lmItems"></div><button type="button" class="lm-btn secondary" id="lmAddItem">+ Добавить позицию</button><label class="lm-consent"><input type="checkbox" required><span>Я представляю этот бизнес и согласен на публикацию указанных контактов и материалов.</span></label>${merchant?'<p class="lm-note">После изменения карточка снова отправится на проверку и временно скроется. Оплаченный срок не изменится.</p>':''}<p class="lm-error" role="alert" id="lmFormError"></p><button class="lm-btn full" type="submit">Отправить на проверку</button></form>`);
   const form=body.querySelector('form'),itemBox=form.querySelector('#lmItems'),feedback=form.querySelector('#lmFormError'),submit=form.querySelector('[type=submit]');
   const itemHTML=(item,i)=>`<section class="lm-form-item" data-item="${i}"><div class="lm-row"><h3>Позиция ${i+1}</h3><button type="button" class="lm-remove" data-remove="${i}" ${items.length===1?'disabled':''}>Удалить</button></div><label>Название<input data-field="name" value="${e(item.name)}" minlength="2" maxlength="100" required></label><label>Цена, ₽<input data-field="price" type="number" inputmode="numeric" min="1" max="10000000" step="1" value="${e(item.price)}" required></label><label>Описание<textarea data-field="description" maxlength="700">${e(item.description)}</textarea></label><label>Фото<input type="file" data-photo="${i}" accept="image/jpeg,image/png,image/webp"></label><span data-preview="${i}">${safePicture(item.photo)?`<img class="lm-item-photo" src="${e(item.photo)}" alt="Фото позиции">`:''}</span><button type="button" class="lm-link" data-clear-photo="${i}">Убрать фото</button></section>`;
   const renderItems=()=>{itemBox.innerHTML=items.map(itemHTML).join('');form.querySelector('#lmAddItem').disabled=items.length>=20||uploads>0;};renderItems();
   itemBox.addEventListener('input',event=>{const section=event.target.closest('[data-item]');if(section&&event.target.dataset.field)items[+section.dataset.item][event.target.dataset.field]=event.target.value;});
   form.querySelector('#lmAddItem').onclick=()=>{if(items.length<20){items.push({name:'',description:'',price:'',photo:null});renderItems();itemBox.lastElementChild.querySelector('input').focus();}};
   itemBox.addEventListener('click',event=>{if(uploads)return;const remove=event.target.closest('[data-remove]');if(remove&&items.length>1){items.splice(+remove.dataset.remove,1);renderItems();}const clear=event.target.closest('[data-clear-photo]');if(clear){items[+clear.dataset.clearPhoto].photo=null;renderItems();}});
   async function photoChange(input,index){const file=input.files?.[0];if(!file)return;feedback.textContent='';uploads++;submit.disabled=true;form.querySelector('#lmAddItem').disabled=true;try{const image=await upload(file);if(index===null){photo=image;form.querySelector('#lmCover').innerHTML=`<img class="lm-item-photo" src="${e(image)}" alt="Фото бизнеса">`;}else{items[index].photo=image;itemBox.querySelector(`[data-preview="${index}"]`).innerHTML=`<img class="lm-item-photo" src="${e(image)}" alt="Фото позиции">`;}}catch(error){feedback.textContent=error.message;}finally{input.value='';uploads--;submit.disabled=uploads>0;form.querySelector('#lmAddItem').disabled=items.length>=20||uploads>0;}}
   itemBox.addEventListener('change',event=>{if(event.target.dataset.photo!==undefined)photoChange(event.target,+event.target.dataset.photo);});
   form.elements.photo.onchange=()=>photoChange(form.elements.photo,null);
   form.querySelector('#lmRemoveCover').onclick=()=>{if(uploads)return;photo=null;form.querySelector('#lmCover').innerHTML='';};
   form.onsubmit=async event=>{event.preventDefault();if(uploads)return;submit.disabled=true;feedback.textContent='';
     const fields=new FormData(form);const data={kind:fields.get('kind'),name:fields.get('name').trim(),city:fields.get('city').trim(),address:fields.get('address').trim(),description:fields.get('description').trim(),contact:fields.get('contact').trim().replace(/[ ()-]/g,''),photo,items:items.map(item=>({...item,name:item.name.trim(),description:item.description.trim(),price:Number(item.price)}))};
     if(!contactURL(data.contact)){feedback.textContent='Укажи @имя в Telegram или телефон с кодом страны, например +79991234567.';submit.disabled=false;return;}
     try{await request('save',data,merchant?{id:merchant.id,baseVersion:merchant.version}:{});await owner();const message=document.createElement('p');message.className='lm-review';message.setAttribute('role','status');message.textContent='Карточка отправлена на проверку. Статус появится здесь. Оплата пока не требуется.';body.prepend(message);load();}
     catch(error){feedback.textContent=error.message;submit.disabled=false;}
   };
 }
 async function adminList(){show('Проверка размещений','<p class="lm-note">Загружаем карточки…</p>');try{const result=await request('admin.list');adminRows=result.merchants||[];body.innerHTML='<p class="lm-note">Одобрение карточки и подтверждение оплаты — отдельные действия. В каталог попадут только одобренные карточки с действующим оплаченным сроком.</p>'+(adminRows.length?adminRows.map(m=>ownerCard(m,true)).join(''):'<p class="lm-note">Новых карточек пока нет.</p>');}catch(error){body.innerHTML=errorBox(error.message);}}
 async function review(summary){
   show('Проверить карточку','<p class="lm-note">Загружаем…</p>');
   let m;try{m=(await request('admin.detail',{}, {id:summary.id})).merchant;}catch(error){body.innerHTML=errorBox(error.message);return;}
   show('Проверить карточку',detailHTML(m,{review:true})+`<form class="lm-form" id="lmReview"><label>Комментарий владельцу<textarea name="note" maxlength="1000">${e(m.review_note)}</textarea></label><p class="lm-error" role="alert"></p><div class="lm-row"><button class="lm-btn secondary" type="submit" value="approved">Одобрить</button><button class="lm-btn danger" type="submit" value="rejected">Вернуть на исправление</button></div></form>${m.status==='approved'?`<div class="lm-payment"><h3>Подтверждение оплаты размещения</h3><form class="lm-form" id="lmPayment"><label>Номер платежа или квитанции<input name="receipt" minlength="3" maxlength="120" required></label><label class="lm-consent"><input name="confirmed" type="checkbox" required><span>Я проверил поступление 3 000 ₽ за эту витрину.</span></label><p class="lm-note">Это запись уже полученной оплаты. Система добавит один календарный месяц к текущему сроку или к сегодняшней дате, если срок истёк.</p><p class="lm-error" role="alert"></p><button class="lm-btn full" type="submit">Оплата получена · добавить месяц</button></form></div>`:''}`);
   const form=body.querySelector('#lmReview');form.onsubmit=async event=>{event.preventDefault();const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await request('admin.review',{decision:event.submitter.value,note:form.elements.note.value.trim()},{id:m.id,baseVersion:m.version});await adminList();load();}catch(error){form.querySelector('.lm-error').textContent=error.message;buttons.forEach(b=>b.disabled=false);}};
   const payment=body.querySelector('#lmPayment');if(payment)payment.onsubmit=async event=>{event.preventDefault();const button=payment.querySelector('button');button.disabled=true;try{await request('admin.payment',{receipt:payment.elements.receipt.value.trim(),confirmed:payment.elements.confirmed.checked},{id:m.id,baseVersion:m.version});await adminList();load();}catch(error){payment.querySelector('.lm-error').textContent=error.message;button.disabled=false;}};
 }
 root.addEventListener('click',event=>{
   const category=event.target.closest('[data-kind]');if(category){kind=category.dataset.kind;root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===category)));legacy.hidden=!!kind&&kind!=='store';load();return;}
   const card=event.target.closest('[data-detail]');if(card){detail(card.dataset.detail);return;}
   const action=event.target.closest('[data-action]')?.dataset.action;
   if(action==='mine')owner();if(action==='create')owner(true);if(action==='reload')load();if(action==='reset'){root.querySelector('#lmQuery').value='';root.querySelector('#lmCity').value='';root.querySelector('[data-kind=""]').click();}
 });
 root.querySelectorAll('.lm-search input').forEach(input=>input.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(load,350);}));
 body.addEventListener('click',async event=>{
   const action=event.target.closest('[data-action]')?.dataset.action;if(action==='new')editor();if(action==='admin')adminList();
   const edit=event.target.closest('[data-edit]');if(edit){const m=mine.find(m=>m.id===edit.dataset.edit);if(m)editor(m);}
   const pause=event.target.closest('[data-pause]');if(pause){const m=mine.find(m=>m.id===pause.dataset.pause);if(!m)return;pause.disabled=true;try{await request('pause',{}, {id:m.id,baseVersion:m.version});await owner();load();}catch(error){pause.closest('.lm-owner-card').querySelector('.lm-error').textContent=error.message;pause.disabled=false;}}
   const row=event.target.closest('[data-review]');if(row){const m=adminRows.find(m=>m.id===row.dataset.review);if(m)review(m);}
 });
 let loaded=false;const observer=new MutationObserver(()=>{if(screen.classList.contains('active')&&!loaded){loaded=true;load();}});observer.observe(screen,{attributes:true,attributeFilter:['class']});if(screen.classList.contains('active')){loaded=true;load();}
}
