// Helpers for the classic Mini App. The form buttons also supply the species filter labels.
let boardAnimalButtons, boardAnimalIndex;
function boardSpeciesButtons() { return boardAnimalButtons??=[...document.querySelectorAll('#pfTypeRow [data-animal]')]; }
function boardNormalize(value) { return String(value ?? '').trim().toLowerCase().replace(/ё/g,'е'); }
function boardLabels(button) { return [button.dataset.animal, button.dataset.plural, ...button.dataset.aliases.split(',')]; }
function boardSpecies(value) {
  if(!boardAnimalIndex)boardAnimalIndex=new Map(boardSpeciesButtons().flatMap(button=>boardLabels(button).map(label=>[boardNormalize(label),button])));
  return boardAnimalIndex.get(boardNormalize(value))||boardAnimalIndex.get('другое');
}
function boardChooseSpecies(value) {
  const current = boardSpecies(value);
  boardSpeciesButtons().forEach(button => {
    button.classList.toggle('sel', button === current);
    button.setAttribute('aria-pressed', String(button === current));
  });
}
function boardPetSpecies(pet) {
  const type = boardSpecies(pet.type).dataset.animal, breed = boardNormalize(pet.breed);
  if ((type === 'Грызун' || type === 'Другое') && /^(сурикат|meerkat)$/.test(breed)) return 'Сурикат';
  if (type !== 'Другое') return type;
  return boardSpecies(careType(pet)).dataset.animal;
}
function boardAdKind(kind) { return ['lost','found','adopt'].includes(kind); }
function boardSpeciesFilters() {
  return boardSpeciesButtons().map(({dataset}) => [dataset.animal, dataset.plural, dataset.iconName || '']);
}

const boardPage = {offset:0, more:false, pending:false};
let boardView = 'list', boardMap = null, boardMapPending = null, boardMapEpoch = 0;
const boardEl = id => document.getElementById(id);

function boardQuery(kind, filter, offset) {
  const query = new URLSearchParams({kind:'eq.'+kind, select:'*', order:'created_at.desc,id.desc', limit:'31', offset:String(offset)});
  if (filter === 'found') query.set('status','eq.found');
  else if (filter === 'mine') query.set('author_id','eq.'+ME.id);
  else query.append('or','(status.is.null,status.not.in.(found,hidden))');
  const animal = boardSpeciesButtons().find(button => button.dataset.animal === filter);
  if (animal) {
    if (filter === 'Другое') {
      const known = boardSpeciesButtons().filter(button => button !== animal).flatMap(boardLabels);
      query.append('or','(animal_type.is.null,and('+known.map(word=>'animal_type.not.ilike.'+word).join(',')+'))');
    } else query.append('or','('+boardLabels(animal).map(word=>'animal_type.ilike.'+word).join(',')+')');
  }
  return query;
}
function boardPaging() {
  const more = boardEl('boardMore');
  more.hidden = !boardAdKind(curKind) || !boardPage.more;
  more.disabled = boardPage.pending;
}
async function boardLoadPosts(append=false) {
  if (append && (!boardPage.more || boardPage.pending)) return;
  const request=++boardReq, offset=append?boardPage.offset:0;
  if (!append) {
    boardPage.more=false; boardCache=[]; helpState.loading=true; helpState.empty=false;
    boardEl('boardList').textContent='Загружаем объявления…';
    boardEl('boardMapNote').textContent='Загружаем объявления…';
    boardMap?.update([]); boardEl('boardMapChoices').replaceChildren();
  }
  boardEl('boardRetry').hidden=true;
  boardPage.pending=true; boardPaging(); helpUpdateChrome(); renderFilters();
  try {
    const response=await fetch(SB_URL+'/rest/v1/posts?'+boardQuery(curKind,curFilter,offset),{headers:SB_H});
    if (!response.ok) throw Error('Не удалось загрузить объявления');
    const rows=await response.json();
    if (!Array.isArray(rows)) throw Error('Не удалось загрузить объявления');
    if (request!==boardReq) return;
    const seen=new Set(boardCache.map(p=>p.id)), page=rows.slice(0,30);
    boardCache.push(...page.filter(p=>!seen.has(p.id)));
    boardPage.offset=offset+page.length; boardPage.more=rows.length>30;
    helpState.loading=false; renderBoard();
  } catch {
    if (request!==boardReq) return;
    helpState.loading=false;
    boardEl('boardRetry').hidden=false;
    if(!append) {
      boardEl('boardList').textContent=boardEl('boardMapNote').textContent='Не удалось загрузить объявления. Проверь подключение.';
      boardEl('boardMapCanvas').hidden=true;
    }
  } finally {
    if(request===boardReq) {boardPage.pending=false;boardPaging();}
  }
}
function boardCloseMap() {
  boardMapEpoch++; boardMap?.destroy(); boardMap=null; boardMapPending=null;
  boardEl('boardMapCanvas')?.replaceChildren(); boardEl('boardMapChoices')?.replaceChildren();
}
function boardSyncView() {
  const supported=boardAdKind(curKind)&&!!helpState.section;
  const mapped=supported&&boardView==='map';
  boardEl('boardViews').hidden=!supported;
  boardEl('boardMap').hidden=!mapped;
  boardEl('boardList').hidden=mapped;
  boardEl('boardViewMap').setAttribute('aria-pressed',String(mapped));
  boardEl('boardViewList').setAttribute('aria-pressed',String(!mapped));
  if(!supported){boardEl('boardMore').hidden=true;boardEl('boardRetry').hidden=true;}
}
function boardSetView(view) {
  if(!boardAdKind(curKind)||!['list','map'].includes(view))return;
  if(view==='list')boardCloseMap();
  boardView=view;boardSyncView();
  if(!boardEl('boardRetry').hidden && !boardCache.length) return;
  renderBoard();
}
function boardShowCard(post) {
  boardSetView('list');
  const card=[...boardEl('boardList').querySelectorAll('[data-board-post]')].find(el=>el.dataset.boardPost===String(post.id));
  if(card){card.focus({preventScroll:true});card.scrollIntoView({block:'start'});}
}
async function boardDrawMap() {
  const epoch=boardMapEpoch, note=boardEl('boardMapNote'), canvas=boardEl('boardMapCanvas');
  const active=()=>epoch===boardMapEpoch&&boardView==='map'&&curScreen==='help'&&boardAdKind(curKind);
  try {
    const {mappablePosts,createBoardMap}=await import(new URL('./board-map.mjs', boardAssetUrl).href);
    if(!active()||helpState.loading)return;
    const posts=helpVisiblePosts(), rows=mappablePosts(posts);
    boardEl('boardMapChoices').replaceChildren();
    if(!rows.length){
      boardCloseMap();canvas.hidden=true;
      note.textContent=posts.length?'У этих объявлений пока нет точки на карте. Открой список, чтобы посмотреть карточки.':'По выбранным фильтрам объявлений пока нет.';
      return;
    }
    canvas.hidden=false;
    if(!boardMap){
      note.textContent='Загружаем карту…';
      if(!boardMapPending){
        const host=document.createElement('div');host.className='board-map-inner';canvas.replaceChildren(host);
        const first=rows[0];boardMapPending=createBoardMap(host,{lat:first.public_lat,lng:first.public_lng},{
          openPost:boardShowCard,clusterList:boardEl('boardMapChoices'),imageUrl:safeImageUrl,emoji:value=>boardSpecies(value).dataset.emoji
        }).then(map=>{if(active())boardMap=map;else map.destroy();});
      }
      await boardMapPending;
      if(!active()||helpState.loading)return;
    }
    const latest=helpVisiblePosts(),pins=mappablePosts(latest);
    boardMap.update(pins);
    note.textContent=latest.length>pins.length?'Часть объявлений доступна только в списке. Метки показывают примерное место.':'Метки показывают примерное место. Нажми на метку, чтобы открыть объявление.';
  } catch {
    if(!active())return;
    boardCloseMap();canvas.hidden=true;note.textContent='Не удалось открыть карту. Объявления доступны в списке. ';
    const retry=document.createElement('button');retry.type='button';retry.className='chip';retry.textContent='Повторить';retry.onclick=boardDrawMap;note.append(retry);
  }
}
const boardAssetUrl=document.currentScript.src;
