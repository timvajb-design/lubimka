// Optional UI smoke: install Playwright and its browsers, then run node tests/mobile-browser.mjs.
// PLAYWRIGHT_MODULE can point to an existing installation; no dependency is bundled in either app.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium, webkit, devices } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const origin = 'https://lubimka-app.netlify.app';
const phones = [
  { name: 'WebKit / iPhone', browser: webkit, device: devices['iPhone 13'] },
  { name: 'Chromium / Android', browser: chromium, device: devices['Pixel 7'] },
];

for (const { name, browser, device } of phones) {
  test(name + ' — guest home, public board, map and sign-in', async () => {
    const options = browser === chromium && process.env.CHROMIUM_CHANNEL
      ? { channel: process.env.CHROMIUM_CHANNEL } : {};
    const instance = await browser.launch(options);
    try {
      const page = await instance.newPage({ ...device, locale: 'ru-RU' });
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const section = id => page.locator('.web-nav [data-web-nav="' + id + '"]');
      await section('home').waitFor({ state: 'visible' });
      await page.locator('#webHome').waitFor({ state: 'visible' });
      assert.ok(await page.locator('#zootaxiBook').isVisible());
      await section('board').click();
      await page.locator('#webBoard').waitFor({ state: 'visible' });
      assert.equal(await section('board').getAttribute('aria-current'), 'page');
      await section('map').click();
      await page.locator('#webMap').waitFor({ state: 'visible' });
      assert.equal(await section('map').getAttribute('aria-current'), 'page');
      await section('profile').click();
      await page.locator('#webProfileLogin').click();
      await page.locator('#webAuth[open]').waitFor({ state: 'visible' });
      assert.ok(await page.locator('#webTelegramLogin').isVisible());
      await page.locator('#webEmailToggle').click();
      await page.locator('#webEmail').waitFor({ state: 'visible' });
      await page.locator('#webAuth [data-close="webAuth"]').first().click();
      await section('home').click();
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, 'горизонтальная прокрутка: ' + overflow);
      // The iOS scanner routes printed tags to the public card on this same origin.
      // Use a synthetic tag and answer every matching lookup locally.
      const token = '1234'.repeat(8);
      let tagRead = false;
      await page.route('**/*', async route => {
        const payload = route.request().postData() || '';
        if (payload.includes(token)) {
          assert.ok(payload.includes('publicTag'));
          tagRead = true;
          return route.fulfill({ json: { tag: { name: 'Тестовый питомец', type: 'Кошка' } } });
        }
        return route.continue();
      });
      await page.goto(origin + '/#tag=' + token);
      await page.locator('.qr-public-card').getByText('Тестовый питомец').waitFor();
      assert.equal(tagRead, true);
    } finally {
      await instance.close();
    }
  });
}
