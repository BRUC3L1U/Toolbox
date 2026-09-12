const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let browser, server, url;
const fixture = { v: 1, revision: 1, groups: [{ id: 'g', name: '牛奶对比', items: [
  { id: 'a', name: '纯牛奶 250g × 24盒', unitWeight: 250, packSize: 24, packCount: 1, totalPrice: 59.9 },
  { id: 'b', name: '纯牛奶 200g × 12盒', unitWeight: 200, packSize: 12, packCount: 1, totalPrice: 32.9 },
] }] };
before(async () => {
  const root = path.resolve(__dirname, '../..');
  const files = new Set(['/index.html', '/app.js', '/styles.css', '/favicon.png']);
  server = http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.replace(/^\/$/, '/index.html');
    if (!files.has(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html');
    res.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {});
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });
async function withPage(run, width = 375) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const errors = [];
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(data => localStorage.setItem('toolbox_price_groups', JSON.stringify(data)), fixture);
    await page.reload();
    await page.locator('#tab-price').click();
    await run(page, context);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
  } catch (error) {
    fs.mkdirSync('test-results', { recursive: true });
    for (const [index, page] of context.pages().entries()) {
      await page.screenshot({ path: `test-results/failure-${Date.now()}-${index}.png`, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { await context.close(); }
}
async function newGroup(page, name) {
  await page.locator('#new-group-name').fill(name);
  await page.locator('#create-group-form button').click();
  await page.waitForFunction(name => [...document.querySelectorAll('.group-name')].some(el => el.textContent === name), name);
}
async function storedName(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('toolbox_price_groups')).groups[0].items[0].name);
}

test('unrelated local writes preserve a pending item edit', () => withPage(async page => {
  await page.locator('[data-action=edit]').first().click();
  await page.locator('.item-edit-form [data-field=name]').fill('修改后的牛奶');
  await newGroup(page, '零食');
  await page.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.item-edit-form'));
  assert.equal(await storedName(page), '修改后的牛奶');
}));

test('edit focus enters the form and returns after cancel and save', () => withPage(async page => {
  const edit = page.locator('[data-action=edit]').first();
  await edit.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.item-edit-form [data-field=name]').evaluate(e => e === document.activeElement), true);
  await page.locator('[data-action=cancel-edit]').click();
  assert.equal(await edit.evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('Enter');
  await page.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.item-edit-form'));
  assert.equal(await edit.evaluate(e => e === document.activeElement), true);
}));

test('price fields have persistent labels and actionable errors', () => withPage(async page => {
  const form = page.locator('.group-add-item-form');
  assert.equal(await form.locator('input').evaluateAll(es => es.every(e => e.labels.length > 0)), true);
  await form.locator('button').click();
  const weight = form.locator('[data-field=unitWeight]');
  assert.equal(await weight.getAttribute('aria-invalid'), 'true');
  assert.match(await form.innerText(), /大于 0/);
  assert.equal(await weight.evaluate(e => e === document.activeElement), true);
  await weight.fill('100');
  assert.notEqual(await weight.getAttribute('aria-invalid'), 'true');
  await form.locator('[data-field=totalPrice]').fill('10');
  await form.locator('button').click();
  await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 3);
}));

test('energy recalculation removes stale errors on the target field', () => withPage(async page => {
  await page.locator('#tab-energy').click();
  await page.locator('#input-kj').fill('abc');
  assert.equal(await page.locator('#input-kj').getAttribute('aria-invalid'), 'true');
  await page.locator('#input-kcal').fill('100');
  assert.equal(await page.locator('#input-kj').inputValue(), '418');
  assert.equal(await page.locator('#input-kj').evaluate(e => e.classList.contains('error')), false);
  assert.notEqual(await page.locator('#input-kj').getAttribute('aria-invalid'), 'true');
}));

for (const width of [320, 375, 640, 768, 1440]) {
  test(`all tools fit a ${width}px viewport`, () => withPage(async page => {
    for (const tool of ['energy', 'counter', 'price', 'timer']) {
      await page.locator(`#tab-${tool}`).click();
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert.ok(dimensions.content <= dimensions.viewport, `${tool}: ${JSON.stringify(dimensions)}`);
      assert.equal(await page.locator('.tool-page.active').count(), 1);
    }
  }, width));
}

test('per-100g price is primary and mobile cards leave room for the form', () => withPage(async page => {
  const sizes = await page.locator('.item-card').first().evaluate(e => ({
    primary: parseFloat(getComputedStyle(e.querySelector('.item-unit-price-100')).fontSize),
    secondary: parseFloat(getComputedStyle(e.querySelector('.item-unit-price')).fontSize),
    height: e.getBoundingClientRect().height,
  }));
  assert.ok(sizes.primary > sizes.secondary);
  assert.ok(sizes.height < 210, `Card height ${sizes.height}`);
}));

test('remote edits to another item keep the current draft and new data', () => withPage(async (page, context) => {
  const other = await context.newPage(); await other.goto(url + '/#price');
  await page.locator('[data-action=edit]').first().click();
  await page.locator('.item-edit-form [data-field=name]').fill('本页草稿');
  await other.locator('[data-action=edit]').nth(1).click();
  await other.locator('.item-edit-form [data-field=name]').fill('远程改名');
  await other.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelectorAll('.item-name')[1].textContent.includes('远程改名'));
  assert.equal(await page.locator('.item-edit-form [data-field=name]').inputValue(), '本页草稿');
  await page.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.item-edit-form'));
  assert.equal(await storedName(page), '本页草稿');
  assert.match(await page.locator('.item-name').nth(1).textContent(), /远程改名/);
}));

test('remote changes to the edited item close the stale form without overwriting', () => withPage(async (page, context) => {
  const other = await context.newPage(); await other.goto(url + '/#price');
  await page.locator('[data-action=edit]').first().click();
  await page.locator('.item-edit-form [data-field=name]').fill('过期草稿');
  await other.locator('[data-action=edit]').first().click();
  await other.locator('.item-edit-form [data-field=name]').fill('远程版本');
  await other.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.item-edit-form'));
  assert.equal(await storedName(page), '远程版本');
}));

test('a failed edit preserves its fractional values and can be retried', () => withPage(async page => {
  await page.locator('[data-action=edit]').first().click();
  await page.locator('.item-edit-form [data-field=name]').fill('重试草稿');
  await page.locator('.item-edit-form [data-field=unitWeight]').fill('0.001');
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'toolbox_price_groups') throw new DOMException('quota', 'QuotaExceededError');
      return window.originalSetItem.call(this, key, value);
    };
  });
  await page.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#price-storage-status').textContent.includes('无法保存'));
  assert.equal(await page.locator('.item-edit-form [data-field=name]').inputValue(), '重试草稿');
  assert.equal(await storedName(page), fixture.groups[0].items[0].name);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.item-edit-form'));
  assert.equal(await storedName(page), '重试草稿');
}));

test('long group and product names fit mobile cards and editing fields', () => withPage(async page => {
  await newGroup(page, 'LongUnbrokenProductGroupName'.repeat(4));
  await page.locator('[data-action=edit]').first().click();
  await page.locator('.item-edit-form [data-field=name]').fill('LongUnbrokenProductName'.repeat(4));
  await page.locator('.item-edit-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.item-edit-form'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}));
