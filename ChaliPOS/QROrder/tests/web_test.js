// 顾客页面测试：用 Playwright 在手机尺寸下点单，再用店员接口接单、叫号（见 run_local.sh）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const KEY = fs.readFileSync(process.env.CHALI_KEY_FILE, 'utf8').trim();
const REST = process.env.CHALI_REST || 'http://localhost:3000';
const PAGE = process.env.CHALI_PAGE || 'http://localhost:8080/';
const shots = process.argv[2] || 'shots';
fs.mkdirSync(shots, { recursive: true });

async function staff(fn, args) {
  const r = await fetch(REST + '/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_store: 'chalichali-01', p_key: KEY, ...args }) });
  return r.json();
}
async function publicRpc(fn, args) {
  const r = await fetch(REST + '/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return r.json();
}
function check(name, cond, detail) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + detail)); if (!cond) process.exitCode = 1; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(PAGE + '?s=chalichali-01&t=T3');
  await page.waitForSelector('.item');
  await page.screenshot({ path: shots + '/1-menu.png' });
  check('席号显示', (await page.textContent('header')).includes('T3'));
  check('有座位时默认店内', (await page.getAttribute('.dining button:nth-child(2)', 'class')) === 'on');
  const soldOut = page.locator('.item.soldout');
  check('售罄饮品不能点', (await soldOut.count()) === 1 && (await soldOut.first().isDisabled()));

  // 乌龙烤鲜奶 L 少冰 50% +珍珠 ×2
  await page.locator('.item', { hasText: '焙煎ウーロンミルク' }).click();
  await page.waitForSelector('.sheet.show');
  await page.locator('.sheet .chip', { hasText: '氷少なめ' }).click();
  await page.locator('.sheet .chip', { hasText: '50%' }).click();
  await page.locator('.sheet .chip', { hasText: 'タピオカ' }).click();
  await page.locator('.sheet .qty button', { hasText: '+' }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('sheet').scrollTop = 0; });
  await page.screenshot({ path: shots + '/2-options.png' });
  check('弹层价格 750×2', (await page.textContent('.sheet .primary')).includes('¥1,500'));
  await page.click('.sheet .primary');
  await page.waitForTimeout(300);

  // 奇异之旅：只有 L、不能做热的
  await page.locator('.item', { hasText: 'キウイトリップ' }).click();
  await page.waitForSelector('.sheet.show');
  check('鲜果不显示 HOT', (await page.locator('.sheet .chip', { hasText: 'ホット' }).count()) === 0);
  check('只有一个规格时不显示规格行', !(await page.textContent('.sheet')).includes('サイズ'));
  check('弹层里没有 null / [object', !/null|\[object/.test(await page.textContent('.sheet')), await page.textContent('.sheet'));
  await page.click('.sheet .primary');
  await page.waitForTimeout(300);
  check('购物车条 3 点 ¥2,280', (await page.textContent('#cartbar')).replace(/\s/g, '').includes('3カートを見る¥2,280'));

  await page.click('#cartbar button');
  await page.waitForSelector('.sheet.show');
  const cartText = await page.textContent('.sheet');
  check('购物车显示两行和合计', cartText.includes('焙煎ウーロンミルク') && cartText.includes('キウイトリップ') && cartText.includes('¥2,280') && !/null|\[object/.test(cartText), cartText);
  await page.evaluate(() => { document.getElementById('sheet').scrollTop = 0; });
  await page.fill('.sheet textarea', '氷は別でお願いします');
  await page.screenshot({ path: shots + '/3-cart.png' });
  await page.click('.sheet .primary');
  await page.waitForSelector('.status .num');
  const number = await page.textContent('.status .num');
  check('下单后显示扫码单号', /^Q\d+$/.test(number), number);
  check('状态页合计', (await page.textContent('.status')).includes('¥2,280'));
  await page.screenshot({ path: shots + '/4-received.png' });

  // 店员接单（取餐号 042）→ 页面 5 秒内更新
  const orders = await staff('chali_staff_orders', {});
  const mine = orders.find((o) => 'Q' + o.number === number);
  check('店员端收到这张单', mine && mine.seat === 'T3' && mine.dining === 'eatIn' && mine.note === '氷は別でお願いします' && mine.total === 2280, JSON.stringify(mine));
  await staff('chali_staff_update_order', { p_order: mine.id, p_status: 'accepted', p_pickup_number: 42 });
  await page.waitForFunction(() => document.querySelector('.status .num').textContent === '042', null, { timeout: 8000 });
  check('付款后显示取餐号 042', true);
  await staff('chali_staff_update_order', { p_order: mine.id, p_status: 'ready' });
  await page.waitForSelector('.status .num.ready', { timeout: 8000 });
  await page.screenshot({ path: shots + '/5-ready.png' });
  check('做好后提示取餐', (await page.textContent('.status .msg')).includes('できあがりました'));

  // 刷新后还能看到自己的单
  await page.reload();
  await page.waitForSelector('.status .num.ready');
  check('刷新后保留订单状态', true);

  // 中文
  await page.click('.lang button:nth-child(2)');
  check('切换中文', (await page.textContent('.status .msg')).includes('做好了'));
  await page.screenshot({ path: shots + '/6-ready-zh.png' });

  // 再点一单 → 回到菜单（中文）
  await page.click('.status .secondary');
  await page.waitForSelector('.item');
  await page.screenshot({ path: shots + '/7-menu-zh.png' });

  // 暂停接单
  const menu = JSON.parse(fs.readFileSync(path.join(__dirname, 'published_menu.json'), 'utf8'));
  menu.businessDay = (await publicRpc('chali_get_menu', { p_store: 'chalichali-01' })).businessDay;
  await staff('chali_staff_publish_menu', { p_menu: menu, p_accepting: false });
  await page.reload();
  await page.waitForSelector('.notice.warn');
  check('暂停接单时提示并禁用', (await page.locator('.item').first().isDisabled()));
  await page.screenshot({ path: shots + '/8-paused.png' });
  await staff('chali_staff_publish_menu', { p_menu: menu, p_accepting: true });

  check('没有 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
