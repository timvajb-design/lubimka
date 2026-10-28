import { HttpError, UUID, readJSON } from './community.mjs';

const check = (ok, message='Проверь заполнение карточки') => { if (!ok) throw new HttpError(400,message); };
const record = value => value && typeof value==='object' && !Array.isArray(value);
function keys(value, allowed){check(record(value)&&Object.keys(value).every(key=>allowed.includes(key)));}
function text(value, max, min=0){check(typeof value==='string'&&value.trim().length>=min&&value.length<=max);return value.trim();}
function picture(value){
  if(value==null||value==='')return null;
  check(typeof value==='string'&&value.length<=300000,'Фото слишком большое. Выбери другое изображение.');
  check(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value),'Загрузи фотографию с устройства');
  return value;
}
export function validateMerchant(value){
  keys(value,['kind','name','city','address','description','contact','photo','items']);
  check(['store','grooming','vet'].includes(value.kind));
  const contact=text(value.contact,100,5);
  check(/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(contact)||/^\+[1-9][0-9]{9,14}$/.test(contact),'Укажи @имя в Telegram или телефон с кодом страны, например +79991234567');
  check(Array.isArray(value.items)&&value.items.length>=1&&value.items.length<=20,'Добавь от 1 до 20 товаров или услуг');
  const items=value.items.map(item=>{
    keys(item,['name','description','price','photo']);
    check(Number.isSafeInteger(item.price)&&item.price>=1&&item.price<=10000000,'Укажи цену в рублях, от 1 до 10 000 000');
    return {name:text(item.name,100,2),description:text(item.description,700),price:item.price,photo:picture(item.photo)};
  });
  const out={kind:value.kind,name:text(value.name,100,2),city:text(value.city,100,2),address:text(value.address,200),description:text(value.description,1500,10),contact,photo:picture(value.photo),items};
  check(value.kind==='store'||out.address.length>=5,'Для груминга или клиники укажи адрес');
  check(new TextEncoder().encode(JSON.stringify(out)).length<=2000000,'Слишком много фотографий. Уменьши их количество.');
  return out;
}
export function validateMarket(command){
  keys(command,['type','id','baseVersion','mutationId','data']);
  check(typeof command.type==='string'&&command.type.startsWith('market.'));
  const action=command.type.slice(7),input=command.data??{},data={};
  check(['catalog','detail','mine','save','pause','admin.list','admin.detail','admin.review','admin.payment'].includes(action));
  if(action==='catalog'){
    keys(input,['kind','city','query']);
    data.kind=input.kind??'';check(['','store','grooming','vet'].includes(data.kind));
    data.city=text(input.city??'',100);data.query=text(input.query??'',100);
  }else if(action==='admin.list'){
    keys(input,['status']);data.status=input.status??'';check(['','pending','approved','rejected','paused'].includes(data.status));
  }else if(action==='save')data.data=validateMerchant(input);
  else if(action==='admin.review'){
    keys(input,['decision','note']);check(['approved','rejected'].includes(input.decision));
    data.decision=input.decision;data.note=text(input.note??'',1000);
    check(data.decision!=='rejected'||data.note.length>=3,'Напиши, что нужно исправить');
  }else if(action==='admin.payment'){
    keys(input,['receipt','confirmed']);data.receipt=text(input.receipt,120,3);
    check(input.confirmed===true,'Подтверди, что оплата 3 000 ₽ действительно получена');data.confirmed=true;
  }else keys(input,[]);
  const write=['save','pause','admin.review','admin.payment'].includes(action);
  if(action==='detail'||action==='pause'||action.startsWith('admin.')&&action!=='admin.list'||command.id){check(UUID.test(command.id));data.id=command.id;}
  if(write){check(UUID.test(command.mutationId));data.mutationId=command.mutationId;
    if(data.id){check(Number.isSafeInteger(command.baseVersion)&&command.baseVersion>=1);data.baseVersion=command.baseVersion;}}
  return {action,data,write,publicRead:['catalog','detail'].includes(action)};
}
export function createMarketHandler({db,identity,origins=[],writesEnabled=true}){
  return async (req,body)=>{
    const origin=req.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin&&origins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,apikey,x-telegram-init-data','Access-Control-Allow-Methods':'POST, OPTIONS'});
    const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers});
    try{
      if(origin&&!origins.includes(origin))throw new HttpError(403,'Недопустимый источник запроса');
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(req.method!=='POST')throw new HttpError(405,'Недопустимый метод');
      const command=validateMarket(body??await readJSON(req,2300000));
      const user=command.publicRead?null:await identity(req);
      if(!command.publicRead&&(!Number.isSafeInteger(user?.id)||user.id<=0))throw new HttpError(401,'Сначала войди в Любимку');
      if(command.write&&!writesEnabled)throw new HttpError(503,'Сохранение временно приостановлено. Попробуй позже');
      const {data,error}=await db.rpc('lubimka_market',{p_actor:user?.id??null,p_action:command.action,p_data:command.data});
      if(error){
        const errors=[['MARKET_NOT_FOUND',404,'Карточка недоступна'],['MARKET_UNAUTHORIZED',401,'Сначала войди'],['MARKET_FORBIDDEN',403,'Нет доступа'],['MARKET_CONFLICT',409,'Карточка уже изменилась. Обнови список и открой её снова'],['MARKET_REUSE',409,'Запрос уже использован. Обнови страницу'],['MARKET_RATE',429,'Слишком много действий. Подожди минуту'],['MARKET_LIMIT',400,'Можно создать до пяти витрин'],['MARKET_REVIEW_FIRST',409,'Сначала одобри карточку'],['MARKET_RECEIPT_USED',409,'Эта оплата уже учтена'],['MARKET_INVALID',400,'Проверь заполнение карточки']];
        const e=errors.find(([key])=>String(error.message).includes(key));
        throw new HttpError(e?.[1]??503,e?.[2]??'Не удалось подтвердить действие. Повтори тот же запрос');
      }
      return reply(200,data);
    }catch(error){return reply(error instanceof HttpError?error.status:503,{error:error instanceof HttpError?error.message:'Сервис временно недоступен'});}
  };
}
// Preserve every existing community route and its authentication/notifications.
export function marketRouter(community,market){return async req=>{
  if(req.method==='OPTIONS')return market(req);
  if(req.method!=='POST')return community(req);
  let body;try{body=await readJSON(req.clone());}catch{return community(req);}
  return typeof body?.type==='string'&&body.type.startsWith('market.')?market(req,body):community(req);
};}
