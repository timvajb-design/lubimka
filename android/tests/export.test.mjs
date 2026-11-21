import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';

const script = await readFile(new URL('../app/src/main/assets/export.js', import.meta.url), 'utf8');
const origin = 'https://lubimka-app.netlify.app';
function fixture(blob, active = true, currentOrigin = origin) {
  const events = new Map();
  const location = {origin:currentOrigin,href:currentOrigin+'/'};
  const elements = [];
  function create(tag) {
    const element = {tag,append(){},addEventListener(){},showModal(){},close(){},remove(){}};
    elements.push(element);
    return element;
  }
  const navigator = {userActivation:{isActive:active}};
  runInNewContext(script, {location,navigator,window:{addEventListener:(k,v)=>events.set(k,v)},
    crypto:{randomUUID},URLSearchParams,btoa,Uint8Array,fetch:async()=>({blob:async()=>blob}),
    document:{createElement:create,body:{append(){}}}});
  function click(href='blob:'+origin+'/synthetic') {
    let prevented = false;
    events.get('click')?.({target:{closest:()=>({href,download:'питомец.png'})},preventDefault(){prevented=true;}});
    return prevented;
  }
  async function read(id=new URL(location.href).searchParams.get('id')) {
    const result = [];
    const port = {postMessage:s=>result.push(s),close(){}};
    await events.get('message')({data:'lubimka-export:'+id,ports:[port]});
    for (let i=0;port.onmessage && i < 600 && result.at(-1)!=='end';i++)
      await port.onmessage({data:'next'});
    return result;
  }
  return {location,navigator,elements,click,read};
}
test('PNG and PDF are streamed losslessly in bounded chunks only for the matching request', async()=>{
  for(const type of ['image/png','application/pdf']) {
    const bytes=Uint8Array.from({length:70000},(_,i)=>i%253);
    const f=fixture(new Blob([bytes],{type}));
    assert(f.click());assert.match(f.location.href,/^lubimka-save:\/\/file\?/);
    assert.deepEqual(await f.read(randomUUID()),[]);
    const messages=await f.read();
    assert.deepEqual(JSON.parse(messages[0]),{type,size:70000});assert.equal(messages.at(-1),'end');
    const chunks=messages.slice(1,-1).map(s=>Buffer.from(s,'base64'));
    assert(chunks.every(b=>b.length<=32768));assert.deepEqual(Buffer.concat(chunks),Buffer.from(bytes));
    assert.deepEqual(await f.read(),[]);
  }
});
test('extra confirmation when PDF generation outlasts user gesture',()=>{
  const f=fixture(new Blob(['pdf'],{type:'application/pdf'}),false);
  assert(f.click());assert.equal(f.location.href,origin+'/');
  f.navigator.userActivation.isActive=true;
  f.elements.find(e=>e.textContent==='Сохранить файл').onclick();
  assert.match(f.location.href,/^lubimka-save:\/\/file\?/);
});
test('foreign top-level origins and foreign Blob URLs do not enter the flow',()=>{
  assert.equal(fixture(new Blob(),true,'https://example.org').click(),false);
  assert.equal(fixture(new Blob()).click('blob:https://example.org/x'),false);
});
test('rejects empty, oversize and unrelated file types',async()=>{
  for(const blob of [
    new Blob([],{type:'image/png'}),new Blob(['bad'],{type:'text/html'}),
    new Blob([new Uint8Array(12*1024*1024+1)],{type:'application/pdf'})
  ]) {const f=fixture(blob);assert(f.click());assert.deepEqual(await f.read(),['error']);}
});
