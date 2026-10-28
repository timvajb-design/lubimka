export const KINDS={store:'Магазин',grooming:'Груминг',vet:'Ветклиника'};
export const ICONS={store:'🛍️',grooming:'✂️',vet:'🩺'};
export function contactURL(contact){
  if(/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(contact))return 'https://t.me/'+contact.slice(1);
  if(/^\+[1-9][0-9]{9,14}$/.test(contact))return 'tel:'+contact;
  return '';
}
export function placementState(merchant,now=Date.now()){
  if(merchant.status==='pending')return {label:'На проверке',tone:'pending'};
  if(merchant.status==='rejected')return {label:'Нужно исправить',tone:'rejected'};
  if(merchant.status==='paused')return {label:'Скрыта владельцем',tone:'paused'};
  if(merchant.status==='approved'&&Date.parse(merchant.paid_until)>now)return {label:'Опубликована',tone:'approved'};
  return {label:'Ожидает оплаты',tone:'pending'};
}
export function safePicture(value){return typeof value==='string'&&value.length<=300000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'';}
export const money=value=>new Intl.NumberFormat('ru-RU').format(value)+' ₽';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
