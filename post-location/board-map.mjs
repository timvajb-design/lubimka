import {createMapAdapter} from './map-adapter.mjs';

let leafletReady;
async function loadLeaflet() {
  if (window.L) return;
  if (!leafletReady) leafletReady = new Promise((resolve, reject) => {
    const css = new URL('./vendor/leaflet.css', import.meta.url).href;
    if (![...document.styleSheets].some(sheet => sheet.href === css)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      document.head.append(link);
    }
    const script = document.createElement('script');
    const finish = success => {
      script.onload = script.onerror = null;
      clearTimeout(timer);
      if (success) resolve();
      else {
        script.remove();
        leafletReady = null;
        reject(Error('Не удалось загрузить карту'));
      }
    };
    const timer = setTimeout(() => finish(false), 12000);
    script.src = new URL('./vendor/leaflet.js', import.meta.url).href;
    script.onload = () => finish(!!window.L);
    script.onerror = () => finish(false);
    document.head.append(script);
  });
  return leafletReady;
}

async function publicMapSettings() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://lubimka-app.netlify.app/api/maps', {credentials:'omit', signal:controller.signal});
    return response.ok ? await response.json() : {};
  } catch { return {}; }
  finally { clearTimeout(timer); }
}

function coordinate(raw, limit) {
  if (typeof raw !== 'number' && !(typeof raw === 'string' && raw.trim())) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 100) / 100 : null;
}

export function mappablePosts(posts) {
  return posts.flatMap(post => {
    const public_lat = coordinate(post.public_lat, 85), public_lng = coordinate(post.public_lng, 180);
    return public_lat === null || public_lng === null ? [] : [{...post, public_lat, public_lng}];
  });
}

export async function createBoardMap(host, center, {openPost, clusterList, imageUrl, emoji}, {
  createMap=createMapAdapter, settings=publicMapSettings, fallback=loadLeaflet
}={}) {
  const config = await settings();
  let map;
  if (config?.provider === 'yandex' && config.yandexKey) {
    try { map = await createMap(host, {provider:'yandex', key:config.yandexKey, center}); } catch {}
  }
  if (!map) {
    host.replaceChildren();
    await fallback();
    map = await createMap(host, {provider:'osm', center, animate:false});
  }
  function marker(group) {
    const first = group[0], button = document.createElement('button');
    button.type = 'button';
    button.className = 'board-species-marker';
    button.setAttribute('aria-label', group.length > 1 ? 'Объявлений в этой точке: ' + group.length : first.title || 'Открыть объявление');
    const photo = imageUrl(first.photos?.[0]);
    if (photo) {
      const img = document.createElement('img');
      img.alt = ''; img.src = photo; button.append(img);
    } else button.textContent = emoji(first.animal_type);
    if (group.length > 1) {
      const count = document.createElement('span');
      count.textContent = String(group.length); button.append(count);
    }
    return button;
  }
  function cluster(group) {
    clusterList.replaceChildren();
    for (const post of group) {
      const button = document.createElement('button');
      button.className = 'chip'; button.type = 'button';
      button.textContent = post.title || 'Объявление';
      button.onclick = () => openPost(post);
      clusterList.append(button);
    }
    clusterList.querySelector('button')?.focus({preventScroll:true});
  }
  let previous = '';
  return {
    update(rows) {
      const points = rows.map(post => ({lat:post.public_lat, lng:post.public_lng}));
      const key = JSON.stringify(points);
      map.resize();
      map.setPosts(rows, {marker, select:openPost, cluster});
      if (points.length && key !== previous) {
        if (points.every(p => p.lat === points[0].lat && p.lng === points[0].lng)) map.setView(points[0], 13);
        else map.fit(points);
      }
      previous = key;
    },
    destroy() { map.destroy(); }
  };
}
