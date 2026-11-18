// Curated service listing. Business placement, billing and moderation use a separate catalogue.
export const hotelPage='/services/kotosfera/';
const publicOrigin='https://lubimka-app.netlify.app';
const name='Котосфера';
const city='Апрелевка';
const address='Цветочный переулок, 3';
const normalize=text=>String(text||'').toLocaleLowerCase('ru').replaceAll('ё','е').trim();
const searchText=normalize([name,city,address,'кот коты кошки для кошек гостиница гостиницы зоогостиница котоотель отель передержка Московская область'].join(' '));
export function hotelMatches(kind,query,cityQuery) {
  return (!kind||kind==='hotel')&&normalize(query).split(/\s+/).every(word=>searchText.includes(word))&&normalize(city).includes(normalize(cityQuery));
}
export function createHotelCard(doc,source) {
  if(!doc.querySelector('link[data-hotel-style]')){
    const style=doc.createElement('link');style.dataset.hotelStyle='';style.rel='stylesheet';
    style.href=new URL('./hotel-card.css',import.meta.url).href;doc.head.append(style);
  }
  const card=doc.createElement('article');card.className='service-hotel';card.dataset.hotel='kotosfera';
  const type=doc.createElement('p');type.className='service-hotel-type';type.textContent='Гостиница для кошек · '+city;
  const heading=doc.createElement('h3');const open=doc.createElement('a');open.textContent='Котоотель «'+name+'»';
  open.href=source==='telegram'?publicOrigin+hotelPage+'?source=telegram':hotelPage;
  if(source==='telegram'){open.target='_blank';open.rel='noopener noreferrer';}
  heading.append(open);
  const location=doc.createElement('p');location.className='service-hotel-address';location.textContent=city+', '+address;
  const actions=doc.createElement('div');actions.className='service-hotel-actions';
  const detail=open.cloneNode(false);detail.textContent='Об отеле';
  const phone=doc.createElement('a');phone.href='tel:+79775830015';phone.textContent='Позвонить';phone.setAttribute('aria-label','Позвонить в Котосферу');
  actions.append(detail,phone);card.append(type,heading,location,actions);
  return card;
}
