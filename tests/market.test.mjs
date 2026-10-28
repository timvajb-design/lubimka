import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMarket,createMarketHandler,marketRouter} from '../supabase/functions/_shared/market.mjs';
import {HttpError} from '../supabase/functions/_shared/community.mjs';
import {contactURL,placementState,escapeHTML} from '../market/domain.mjs';
const id='7cc50c17-bbc2-475e-9211-b49169b8be90',mutationId='2679c67a-6276-45e5-848e-263bda1fa317';
const listing=()=>({kind:'store',name:'Лапки',city:'Москва',address:'Доставка по России',description:'Игрушки для кошек и собак',contact:'@test_store',photo:null,items:[{name:'Ошейник',description:'Мягкий ошейник',price:450,photo:null}]});
test('contact links reject executable URLs, invalid Telegram names and malformed numbers',()=>{
 assert.equal(contactURL('@test_store'),'https://t.me/test_store');assert.equal(contactURL('+79991234567'),'tel:+79991234567');
 for(const value of ['javascript:alert(1)','https://evil.test','@test?text=evil','@1test','+7<script>'])assert.equal(contactURL(value),'');
 assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});
test('a seller cannot submit approval, owner, price plan or paid status',()=>{
 for(const extra of [{owner_id:1},{status:'approved'},{paid_until:'2099-01-01'},{price_rub:1}])assert.throws(()=>validateMarket({type:'market.save',mutationId,data:{...listing(),...extra}}));
 assert.throws(()=>validateMarket({type:'market.save',mutationId,owner_id:1,data:listing()}));
});
test('publication forms enforce useful prices, contact details and image bounds',()=>{
 assert.equal(validateMarket({type:'market.save',mutationId,data:listing()}).data.data.items[0].price,450);
 for(const price of [-1,0,NaN,Infinity,1.5,10000001,'450']){const data=listing();data.items[0].price=price;assert.throws(()=>validateMarket({type:'market.save',mutationId,data}));}
 for(const contact of ['@x','javascript:alert(1)','79991234567'])assert.throws(()=>validateMarket({type:'market.save',mutationId,data:{...listing(),contact}}));
 assert.throws(()=>validateMarket({type:'market.save',mutationId,data:{...listing(),kind:'vet',address:''}}));
 assert.throws(()=>validateMarket({type:'market.save',mutationId,data:{...listing(),photo:'https://tracker.test/image.png'}}));
});
test('edits require a valid ID and exact version; payments require explicit confirmation',()=>{
 assert.throws(()=>validateMarket({type:'market.save',mutationId,id,data:listing()}));
 assert.throws(()=>validateMarket({type:'market.admin.payment',mutationId,id,baseVersion:1,data:{receipt:'ABC123',confirmed:false}}));
 assert.equal(validateMarket({type:'market.admin.payment',mutationId,id,baseVersion:1,data:{receipt:'ABC123',confirmed:true}}).data.confirmed,true);
});
test('expiry, moderation and pause states take precedence over an old paid period',()=>{
 const future='2099-01-01T00:00:00Z';assert.equal(placementState({status:'approved',paid_until:future}).label,'Опубликована');
 assert.equal(placementState({status:'approved',paid_until:'2000-01-01'}).label,'Ожидает оплаты');
 for(const status of ['pending','rejected','paused'])assert.notEqual(placementState({status,paid_until:future}).label,'Опубликована');
});
const req=(body,origin='https://test.example')=>new Request('https://api.example',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
test('public reads never require identity and never inherit a supplied actor',async()=>{
 let actual;const handler=createMarketHandler({origins:['https://test.example'],identity:()=>{throw Error('must not authenticate public reads');},db:{rpc:async(_,args)=>(actual=args,{data:{merchants:[]},error:null})}});
 const response=await handler(req({type:'market.catalog',data:{}}));assert.equal(response.status,200);assert.equal(actual.p_actor,null);
});
test('private API derives actor from verified identity; unauthorized input never reaches the database',async()=>{
 let calls=0;const db={rpc:async(_,args)=>{calls++;assert.equal(args.p_actor,42);return {data:{},error:null};}};
 const handler=createMarketHandler({db,origins:['https://test.example'],identity:async()=>({id:42})});
 assert.equal((await handler(req({type:'market.mine',data:{}}))).status,200);
 assert.equal((await handler(req({type:'market.mine',data:{}},'https://evil.example'))).status,403);
 const unauth=createMarketHandler({db,origins:['https://test.example'],identity:async()=>{throw new HttpError(401,'Войди');}});
 assert.equal((await unauth(req({type:'market.mine',data:{}}))).status,401);assert.equal(calls,1);
});
test('router preserves legacy requests and forwards marketplace preflight to its CORS handler',async()=>{
 let received;const router=marketRouter(async request=>{received=await request.json();return new Response('legacy');},async(request,body)=>new Response(request.method==='OPTIONS'?'options':body.type));
 const old={type:'post.create',mutationId,data:{title:'Потерялся кот'}};
 assert.equal(await (await router(req(old))).text(),'legacy');assert.deepEqual(received,old);
 assert.equal(await (await router(req({type:'market.catalog',data:{}}))).text(),'market.catalog');
 assert.equal(await (await router(new Request('https://api.example',{method:'OPTIONS'}))).text(),'options');
});
