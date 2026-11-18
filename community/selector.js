// Shared by the Mini App and website. Creating or joining a room is a separate, explicit action.
function mountChatSelector(host, initialScope='general') {
  const group = chatSpecies[chatState.species] ? chatState.species : 'cat';
  let animal = group, scope = initialScope, timer, sequence = 0, offset = 0;
  let joined = null, joinedPending = null;
  const catalogCache = new Map();
  const pageSize = 5;
  function el(tag, text, cls) {
    const n=document.createElement(tag); if(text) n.textContent=text; if(cls) n.className=cls; return n;
  }
  function button(text, click, cls) {
    const b=el('button',text,cls); b.type='button'; b.onclick=click; return b;
  }
  const panel=el('section',null,'comm-selector'), select=el('select'), modes=el('div',null,'comm-modes');
  const results=el('div',null,'comm-results'), search=el('input'), feedback=el('p',null,'comm-feedback');
  const nav=el('nav',null,'comm-pages'), searchBox=el('label',null,'comm-search'), searchLabel=el('span');
  const animalLabel=el('label','Питомец','comm-animal'), top=el('div',null,'comm-top');
  const mine=button('Мои чаты',()=>change('joined'),'comm-mine');
  search.type='search'; search.maxLength=80; search.autocomplete='off';search.enterKeyHint='search';
  search.id='chatSearch';searchBox.append(searchLabel,search);results.id='chatRooms';
  feedback.setAttribute('role','status');nav.setAttribute('aria-label','Страницы сообществ');
  modes.setAttribute('role','group');modes.setAttribute('aria-label','Тип сообщества');
  select.id='chatAnimalChoice';animalLabel.htmlFor=select.id;
  for(const [key,info] of Object.entries(chatSpecies)){
    const option=el('option',info.icon+'  '+info.title);option.value=key;select.append(option);
  }
  select.value=animal;animalLabel.append(select);top.append(animalLabel,mine);
  panel.append(top,modes,searchBox,feedback,results,nav);host.replaceChildren(panel);host.scrollTop=0;
  const current=ticket=>ticket===sequence&&panel.isConnected&&chatEl('chatShell').open&&!chatState.room;
  function pick(room){
    if(!current(sequence)||!room?.slug)return;
    if(!room.summary)chatCacheRooms([room]);chatState.species=animal;chatRoom(room.slug);
  }
  function row(room, description, unread=0) {
    const b=button('',()=>pick(room),'comm-option');
    b.dataset.room=room.slug;
    const text=el('span');text.append(el('strong',room.title));if(description)text.append(el('small',description));
    b.append(text,el('span',unread>0?String(Math.min(unread,99))+(unread>99?'+':''):'›',unread?'comm-count':'comm-chevron'));return b;
  }
  function renderPage({rows,more,previous,next}, kind, term) {
    results.replaceChildren();nav.replaceChildren();
    const browsing=kind!=='general'&&kind!=='joined'&&!term;
    feedback.textContent=rows.length?(browsing?'Подсказки':''):(kind==='joined'?'Здесь появятся сообщества, в которые ты вступишь.':'Ничего не найдено. Попробуй другое название.');
    for(const room of rows)results.append(row(room,room.previewText,room.unread));
    if(previous)nav.append(button('‹ Назад',()=>{offset=Math.max(0,offset-pageSize);draw();}));
    if(more&&(!browsing))nav.append(button('Дальше ›',()=>{offset=next;draw();}));
  }
  function summaries(rooms) {
      return rooms.map(room=>{
        const preview=room.preview;
        const date=room.lastAt?new Date(room.lastAt):null;
        const time=date&&Number.isFinite(+date)?date.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';
        return {slug:room.room,title:room.title,summary:true,
          previewText:[preview?.mine?'Ты':preview?.authorName,preview?.hasPhoto?'Фото':'',preview?.text,time].filter(Boolean).join(' · '),unread:room.unread||0};
      });
  }
  async function joinedRooms() {
    if(joined)return joined;
    if(!joinedPending)joinedPending=chatApi('unread',{summary:true}).then(data=>joined??=summaries(data.rooms||[])).finally(()=>{joinedPending=null;});
    return joinedPending;
  }
  async function directory(kind,term,start){
    const exotic=kind==='breed'&&!!chatExoticGroups[animal];
    if(exotic){
      // Server-side family IDs share the legacy "all" species. The ID prefix and the
      // local stable-ID catalogue restrict this lookup to one family.
      let rooms=catalogCache.get(animal);
      if(!rooms){
        const key=animal;
        const response=await chatApi('catalog',{kind:'breed',species:'all',query:key,limit:50,offset:0});
        rooms=(response.rooms||[]).filter(r=>chatExoticRooms.get(r.slug)?.species===key)
          .map(r=>({...r,...chatExoticRooms.get(r.slug)}));
        catalogCache.set(key,rooms);
      }
      const matches=rooms.filter(room=>chatExoticSearch(room,term));
      return {rows:matches.slice(start,start+pageSize),more:start+pageSize<matches.length,previous:start>0,next:start+pageSize};
    }
    const data=await chatApi('catalog',{kind,species:kind==='city'?'all':animal,query:term,limit:pageSize,offset:start});
    return {rows:(data.rooms||[]).slice(0,pageSize),more:data.hasMore===true,previous:start>0,next:data.nextOffset};
  }
  async function draw(){
    const ticket=++sequence,term=search.value.trim();
    if(!current(ticket))return;
    results.replaceChildren();nav.replaceChildren();feedback.textContent='';
    if(scope==='general'){
      const info=chatSpecies[animal];results.append(row({slug:info.room,title:info.title,kind:'breed',species:animal,breed:null},'Открыть общий чат'));
      return;
    }
    if(scope!=='joined'&&term.length===1){feedback.textContent='Введи ещё одну букву';return;}
    feedback.textContent='Загружаем сообщества…';
    try{
      let page;
      if(scope==='joined'){
        const all=await joinedRooms();page={rows:all.slice(offset,offset+pageSize),more:offset+pageSize<all.length,previous:offset>0,next:offset+pageSize};
      }else page=await directory(scope,term,offset);
      if(current(ticket))renderPage(page,scope,term);
    }catch{
      if(!current(ticket))return;
      feedback.textContent='Не удалось загрузить сообщества.';
      results.append(button('Повторить',draw,'comm-mine'));
    }
  }
  function change(value){
    clearTimeout(timer);scope=value;offset=0;search.value='';modes.replaceChildren();
    const kinds=[['general','Общий чат'],...(animal==='meerkat'?[]:[['breed',chatExoticGroups[animal]||animal==='bird'?'По виду':'По породе']]),['city','По городу']];
    if(scope==='breed'&&animal==='meerkat')scope='general';
    for(const [id,title] of kinds){const b=button(title,()=>change(id));b.dataset.scope=id;b.setAttribute('aria-pressed',String(id===scope));modes.append(b);}
    mine.setAttribute('aria-pressed',String(scope==='joined'));
    searchBox.hidden=scope!=='breed'&&scope!=='city';searchLabel.textContent=scope==='city'?'Найти город':chatExoticGroups[animal]||animal==='bird'?'Найти вид':'Найти породу';
    search.placeholder=scope==='city'?'Например, Москва':'Введи от двух букв';draw();
  }
  select.onchange=()=>{animal=select.value;chatState.species=animal;change('general');};
  panel.updateJoined=rooms=>{
    joined=summaries(rooms);
    const unread=joined.reduce((total,room)=>total+room.unread,0);
    mine.textContent='Мои чаты'+(unread?' · '+(unread>99?'99+':unread):'');
    if(scope==='joined'&&!panel.contains(document.activeElement?.closest('.comm-option')))draw();
  };
  if(typeof chatSummaryRows==='function'&&chatSummaryRows().length)panel.updateJoined(chatSummaryRows());
  search.oninput=()=>{clearTimeout(timer);offset=0;++sequence;results.replaceChildren();nav.replaceChildren();feedback.textContent='';timer=setTimeout(draw,260);};
  change(scope);
}
