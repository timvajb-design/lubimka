import { HttpError, hmac, verifyTelegram } from './community.mjs';
export async function sha256(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function telegramLogin(data,botToken,now=Math.floor(Date.now()/1000)){
  if(!botToken)throw new HttpError(503,'Telegram пока не настроен');
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['id','first_name','last_name','username','photo_url','auth_date','hash'].includes(k)))throw new HttpError(401,'Некорректный вход');
  if(!Number.isSafeInteger(data.id)||data.id<=0||data.id>4503599627370495||!Number.isInteger(data.auth_date)||data.auth_date>now+60||now-data.auth_date>300||!/^[a-f0-9]{64}$/i.test(data.hash||''))throw new HttpError(401,'Вход Telegram устарел');
  if(Object.values(data).some(v=>typeof v!=='string'&&typeof v!=='number')||JSON.stringify(data).length>4096)throw new HttpError(401,'Некорректный вход');
  const text=Object.keys(data).filter(k=>k!=='hash').sort().map(k=>`${k}=${data[k]}`).join('\n');
  const key=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(botToken))),sig=await hmac(key,text);
  let diff=0;for(let i=0;i<32;i++)diff|=sig[i]^parseInt(data.hash.slice(i*2,i*2+2),16);
  if(diff)throw new HttpError(401,'Не удалось подтвердить Telegram');
  return {id:data.id,first_name:String(data.first_name||'Друг').slice(0,200),username:String(data.username||'').slice(0,200)};
}
export function checked(result){if(result.error)throw new HttpError(409,String(result.error.message||'').includes('WEB_LINK_DATA')?'В обоих аккаунтах уже есть данные. Автоматическое объединение остановлено, все записи сохранены.':String(result.error.message||'').includes('WEB_LINK_TAKEN')?'Этот Telegram уже привязан к другому email':'Не удалось подтвердить действие');return result.data;}
export async function emailUser(req,db){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
  if(!token)throw new HttpError(401,'Войди по email');
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user?.email_confirmed_at)throw new HttpError(401,'Вход устарел');
  return data.user;
}
export function verifiedOtpTime(req){
  // Called only after getUser has verified the JWT with Supabase Auth.
  try{const raw=(req.headers.get('authorization')||'').replace(/^Bearer /i,'').split('.')[1];const c=JSON.parse(atob(raw.replaceAll('-','+').replaceAll('_','/')));const time=Math.max(0,...(c.amr||[]).filter(a=>a.method==='otp').map(a=>Number(a.timestamp)||0));return new Date(Math.min(Date.now(),time*1000)).toISOString();}catch{return new Date(0).toISOString();}
}
export async function resolveIdentity(req,db,botToken,{allocate=true}={}){
  const raw=req.headers.get('x-telegram-init-data');
  if(raw)return verifyTelegram(raw,botToken);
  const token=req.headers.get('x-lubimka-session')||'';
  if(!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'Сначала войди');
  const session=checked(await db.from('web_browser_sessions').select('*').eq('token_hash',await sha256(token)).gt('expires_at',new Date().toISOString()).maybeSingle());
  if(!session)throw new HttpError(401,'Сессия завершена');
  if(session.auth_user_id){
    const user=await emailUser(req,db);if(user.id!==session.auth_user_id)throw new HttpError(401,'Сессия не принадлежит пользователю');
    const profile=checked(await db.rpc('lubimka_web_email_owner',{p_auth:user.id,p_allocate:allocate}));
    return {...profile,authUserId:user.id,sessionId:session.token_hash,email:user.email};
  }
  const user=checked(await db.from('users').select('id,first_name,username').eq('id',session.owner_id).single());
  return {...user,sessionId:session.token_hash};
}
