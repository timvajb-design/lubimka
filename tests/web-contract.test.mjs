// Run with Node 22+: node --test tests/web-contract.test.mjs
// Only public GETs. No user credentials, order submissions or messages.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const origin = 'https://lubimka-app.netlify.app';
const get = path => fetch(new URL(path, origin), {
  redirect: 'manual',
  signal: AbortSignal.timeout(20_000),
});

test('the mobile entry point exposes the standalone manifest and Apple home icon', async () => {
  const response = await get('/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<link[^>]+rel=["']manifest["'][^>]+>/i);
  assert.match(html, /<link[^>]+rel=["']apple-touch-icon["'][^>]+>/i);
  assert.match(html, /<meta[^>]+name=["']apple-mobile-web-app-capable["'][^>]+content=["']yes["']/i);
  const manifestResponse = await get('/manifest.json');
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.short_name, 'Любимка');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(item => item.sizes === size + 'x' + size);
    assert.ok(icon);
    assert.equal(new URL(icon.src, origin).origin, origin);
    const image = await get(icon.src);
    assert.equal(image.status, 200);
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test('a new installation reaches the existing backend as a guest', async () => {
  const response = await get('/api/session');
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.mode, 'supabase-production');
  assert.equal(session.user, null);
  assert.equal(typeof session.csrf, 'string');
  assert.ok(session.csrf.length > 0);
});

test('the guest can reach service details and taxi hands off to the Russian origin', async () => {
  const hotel = await get('/services/kotosfera/');
  assert.equal(hotel.status, 200);
  assert.match(await hotel.text(), /<h1>Котосфера<\/h1>/);
  const taxi = await get('/zootaxi');
  assert.ok([301, 302, 307, 308].includes(taxi.status));
  const destination = new URL(taxi.headers.get('location'), origin);
  assert.equal(destination.origin, 'https://taxi.lubimka.online');
  assert.equal(destination.pathname, '/zootaxi');
});
