// No keys here. Inject credentials and database client in the Edge entry point.
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const requireValue = (ok, message = 'Проверь введённые данные') => { if (!ok) throw new HttpError(400, message); };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
}
export async function verifyTelegram(raw, token, now = Math.floor(Date.now() / 1000)) {
  if (!token) throw new HttpError(503, 'Сервис входа временно недоступен');
  if (!raw || raw.length > 16384) throw new HttpError(401, 'Открой приложение через Telegram');
  const params = new URLSearchParams(raw), seen = new Set();
  for (const [k] of params) { if (seen.has(k)) throw new HttpError(401, 'Некорректные данные входа'); seen.add(k); }
  const hash = params.get('hash') || ''; params.delete('hash');
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new HttpError(401, 'Не удалось подтвердить вход');
  const data = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + '=' + v).join('\n');
  const signature = await hmac(await hmac(new TextEncoder().encode('WebAppData'), token), data);
  let diff = 0; for (let i = 0; i < 32; i++) diff |= signature[i] ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16);
  const date = Number(params.get('auth_date'));
  if (diff || !Number.isInteger(date) || date > now + 60 || now - date > 86400) throw new HttpError(401, 'Закрой приложение и открой снова в Telegram');
  let user; try { user = JSON.parse(params.get('user') || ''); } catch { throw new HttpError(401, 'Не удалось подтвердить пользователя'); }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.id > 4503599627370495 || user.is_bot) throw new HttpError(401, 'Некорректный пользователь');
  return { id: user.id, first_name: String(user.first_name || 'Друг').slice(0, 200), username: String(user.username || '').slice(0, 200) };
}
const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
function keys(value, allowed) { requireValue(record(value) && Object.keys(value).every(k => allowed.includes(k))); }
function text(v, max, required = false) { requireValue(typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0)); return v.trim(); }
export function photo(v) {
  if (v == null || v === '') return null;
  requireValue(typeof v === 'string' && v.length <= 2000000);
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)) return v;
  try { const u = new URL(v); requireValue(u.protocol === 'https:' && !u.username && !u.password && !/[\s<>"'\\]/.test(v)); return u.href; }
  catch { throw new HttpError(400, 'Проверь фотографию'); }
}
const postFields = ['title','animal_type','breed','color','marks','description','city','district','event_date','reward','price','photos','contact','public_lat','public_lng'];
export function validateCommand(c) {
  keys(c, ['type','mutationId','id','baseVersion','data']);
  requireValue(UUID.test(c.mutationId));
  const out = { type: c.type, mutationId: c.mutationId }, d = c.data ?? {}, data = {};
  const editing = ['post.update','post.delete','story.update','story.delete'].includes(c.type);
  if (editing) { requireValue(UUID.test(c.id)); out.id = c.id; }
  if (['post.update','post.delete'].includes(c.type)) { requireValue(Number.isSafeInteger(c.baseVersion) && c.baseVersion >= 1); out.baseVersion = c.baseVersion; }
  if (['post.create','post.update'].includes(c.type)) {
    keys(d, [...postFields, ...(c.type === 'post.create' ? ['kind'] : ['status'])]);
    if (c.type === 'post.create') { requireValue(['lost','found','adopt','boarding'].includes(d.kind)); data.kind = d.kind; }
    for (const k of postFields) {
      if (!(k in d)) { if (c.type === 'post.create' && ['title','city'].includes(k)) requireValue(false); continue; }
      if (k === 'public_lat' || k === 'public_lng') { requireValue(d[k] === null || (typeof d[k] === 'number' && Number.isFinite(d[k]) && Math.abs(d[k]) <= (k === 'public_lat' ? 85 : 180))); data[k] = d[k] === null ? null : Math.round(d[k]*100)/100; }
      else if (k === 'photos') { requireValue(d.photos === null || (Array.isArray(d.photos) && d.photos.length <= 8)); data.photos = (d.photos || []).map(v => { const p = photo(v); requireValue(p); return p; }); }
      else if (k === 'event_date') {
        if (!d[k]) data[k] = null;
        else { requireValue(typeof d[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d[k])); const date = new Date(d[k] + 'T00:00:00Z'); requireValue(Number.isFinite(+date) && date.toISOString().slice(0, 10) === d[k]); data[k] = d[k]; }
      } else { data[k] = text(d[k] ?? '', k === 'description' ? 10000 : k === 'marks' ? 2000 : k === 'animal_type' ? 40 : 200, ['title','city'].includes(k)); }
    }
    if ('public_lat' in d || 'public_lng' in d) requireValue(('public_lat' in d) && ('public_lng' in d) && ((d.public_lat === null) === (d.public_lng === null)));
    if ('status' in d) { requireValue(['active','found'].includes(d.status)); data.status = d.status; }
    requireValue(c.type !== 'post.update' || Object.keys(data).length > 0);
  } else if (['story.create','story.update'].includes(c.type)) {
    keys(d, ['name','text','kind','photo']);
    data.name = text(d.name, 200, true); data.text = text(d.text, 10000, true);
    requireValue(['home','found','help'].includes(d.kind)); data.kind = d.kind; data.photo = photo(d.photo);
  } else if (c.type === 'shop.save') {
    keys(d, ['slot','photo']); requireValue(['toy1','toy2','house'].includes(d.slot)); data.slot = d.slot; data.photo = photo(d.photo); requireValue(data.photo);
  } else if (c.type === 'report.create') {
    keys(d, ['post_id','reason']); requireValue(UUID.test(d.post_id)); data.post_id = d.post_id; data.reason = text(d.reason, 1000, true);
  } else { requireValue(['post.delete','story.delete','helper.join','helper.leave'].includes(c.type)); keys(d, []); }
  out.data = data; return out;
}
export async function readJSON(req, limit = 8 * 1024 * 1024) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Ожидается JSON');
  if (Number(req.headers.get('content-length')) > limit) throw new HttpError(413, 'Слишком много данных');
  const reader = req.body?.getReader(); if (!reader) throw new HttpError(400, 'Пустой запрос');
  let size = 0; const chunks = [];
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Слишком много данных'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let at = 0; for (const c of chunks) { all.set(c, at); at += c.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); } catch { throw new HttpError(400, 'Некорректный JSON'); }
}
export function createCommunityHandler({ db, botToken, adminIds = [], origins = [], writesEnabled = true, identity = null, wake = async () => {}, background = p => { void p.catch(() => {}); } }) {
  return async req => {
    const origin = req.headers.get('origin'), headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin' };
    if (origin && origins.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'content-type,apikey,x-telegram-init-data', 'Access-Control-Allow-Methods':'POST, OPTIONS' });
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    try {
      if (origin && !origins.includes(origin)) throw new HttpError(403, 'Недопустимый источник запроса');
      if (req.method === 'OPTIONS') return new Response(null, { status:204, headers });
      if (req.method !== 'POST') throw new HttpError(405, 'Недопустимый метод');
      const user = identity ? await identity(req) : await verifyTelegram(req.headers.get('x-telegram-init-data') || '', botToken);
      if (!writesEnabled) throw new HttpError(503, 'Сохранение объявлений временно приостановлено. Попробуй позже');
      const command = validateCommand(await readJSON(req));
      const { data, error } = await db.rpc('lubimka_community', { p_owner:user.id, p_name:user.first_name, p_username:user.username, p_admin:adminIds.includes(user.id), p_command:command });
      if (error) {
        const m = String(error.message || '');
        const errors = [['COMM_NOT_FOUND',404,'Объявление не найдено или принадлежит другому человеку'],['COMM_FORBIDDEN',403,'Нет доступа'],['COMM_CONFLICT',409,'Запись уже изменилась. Обнови список и открой её снова'],['COMM_REUSE',409,'Этот запрос уже использован с другими данными'],['COMM_LIMIT',429,'Слишком много действий. Попробуй позже'],['COMM_INVALID',400,'Проверь введённые данные']];
        const e = errors.find(([code]) => m.includes(code)); throw new HttpError(e?.[1] || 503, e?.[2] || 'Не удалось подтвердить сохранение. Повтори тот же запрос');
      }
      if (command.type === 'post.create' && data?.post && ['lost','found'].includes(data.post.kind)) background(Promise.resolve().then(() => wake(data.post.id)).catch(() => {}));
      return reply(200, data);
    } catch (e) { return reply(e instanceof HttpError ? e.status : 503, { error:e instanceof HttpError ? e.message : 'Сервис временно недоступен' }); }
  };
}
