import { resolveIdentity } from '../_shared/web-auth.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createMarketHandler, marketRouter } from '../_shared/market.mjs';
import { createCommunityHandler } from '../_shared/community.mjs';
const url = Deno.env.get('SUPABASE_URL') || '';
const isolatedTest=url==='https://khrkxsdtuylkhlakzczc.supabase.co';
const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth:{persistSession:false,autoRefreshToken:false} });
const community=createCommunityHandler({
  db,identity:req=>resolveIdentity(req,db,Deno.env.get('BOT_TOKEN')||''), botToken:Deno.env.get('BOT_TOKEN') || '',
  writesEnabled:isolatedTest || Deno.env.get('COMMUNITY_WRITES_ENABLED') === 'true',
  adminIds:(Deno.env.get('COMMUNITY_ADMIN_IDS') || '').split(',').map(Number).filter(n => Number.isSafeInteger(n) && n > 0),
  origins:(Deno.env.get('APP_ORIGINS') || '').split(',').filter(Boolean),
  background:(promise:Promise<unknown>) => EdgeRuntime.waitUntil(promise),
  wake:async (postId:string) => {
    if(isolatedTest)return; // Test posts never wake an external notification worker.
    const secret = Deno.env.get('NOTIFY_SECRET'); if (!secret) return;
    await fetch(url + '/functions/v1/notify-post', { method:'POST',headers:{'Content-Type':'application/json','x-notify-secret':secret},body:JSON.stringify({postId}),signal:AbortSignal.timeout(10000) });
  }
});



const market=createMarketHandler({db,identity:req=>resolveIdentity(req,db,Deno.env.get('BOT_TOKEN')||''),origins:[...new Set([...(Deno.env.get('APP_ORIGINS')||'').split(',').filter(Boolean),'https://timvajb-design.github.io','https://lubimka-app.netlify.app','https://app.lubimka.online','https://lubimka-web-test.netlify.app'])],writesEnabled:isolatedTest||Deno.env.get('COMMUNITY_WRITES_ENABLED')==='true'});
Deno.serve(marketRouter(community,market));
