// 接单屏测试：平板（staff.html）+ 顾客手机（index.html）一起跑完整流程（见 run_local.sh）
//   顾客下单 → 平板响铃出现新单 → 已录入收银 → 做好了 → 已取走；取消、售罄、暂停接单、密钥错误、二维码海报
const { chromium } = require('playwright');
const fs = require('fs');
const KEY = fs.readFileSync(process.env.CHALI_KEY_FILE, 'utf8').trim();
const REST = process.env.CHALI_REST || 'http://localhost:3000';
const PAGE = process.env.CHALI_PAGE || 'http://localhost:8080/';
const shots = process.argv[2] || 'shots';
fs.mkdirSync(shots, { recursive: true });

async function publicRpc(fn, args) {
  const r = await fetch(REST + '/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return r.json();
}
function check(name, cond, detail) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + detail)); if (!cond) process.exitCode = 1; }

(async () => {
  // 本机用缓存的浏览器时设 PW_EXE；CI 里用 playwright 自带的
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };

  const tablet = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, locale: 'zh-CN' })).newPage();
  watch(tablet);
  let promptAnswer = '';
  tablet.on('dialog', (d) => d.accept(d.type() === 'prompt' ? promptAnswer : undefined));

  // 没有密钥 → 设置页；错误密钥 → 提示
  await tablet.goto(PAGE + 'staff.html');
  await tablet.waitForSelector('.panel input[type=password]');
  await tablet.fill('.panel input[type=password]', 'wrong-key');
  await tablet.click('.panel .big');
  await tablet.waitForSelector('.err');
  check('错误密钥提示', (await tablet.textContent('.err')).includes('不对'));

  // 用 #k= 一次设置好，地址栏里的密钥马上去掉
  await tablet.goto(PAGE + 'staff.html#k=' + KEY);
  await tablet.waitForSelector('.overlay .big');
  check('地址栏不留密钥', !(await tablet.evaluate(() => location.href)).includes(KEY));
  await tablet.click('.overlay .big');
  await tablet.waitForSelector('.col.received .list');
  await tablet.waitForTimeout(800);
  const pill = async () => (await tablet.textContent('header .pill')).trim();
  if (!(await pill()).includes('接单中')) { await tablet.click('header .pill'); await tablet.waitForTimeout(800); }
  check('接单中', (await pill()).includes('接单中'), await pill());
  const served = await publicRpc('chali_get_menu', { p_store: 'chalichali-01' });
  check('平板发布了 menu.js 这一版菜单', served.menu.version && served.menu.items.length === 48 && served.accepting, JSON.stringify(served.menu.version));
  await tablet.screenshot({ path: shots + '/s1-empty.png' });

  // 顾客手机（中文）点单：茉香奶绿 L 少冰 70% +布丁，杨枝甘露 ×2
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN' })).newPage();
  watch(phone);
  await phone.goto(PAGE + '?t=5');
  await phone.waitForSelector('.item');
  check('中文顾客默认中文', (await phone.textContent('.lang .on')).includes('中文'));
  await phone.locator('.item', { hasText: '茉香奶绿' }).click();
  await phone.waitForSelector('.sheet.show');
  await phone.locator('.sheet .chip', { hasText: '少冰' }).click();
  await phone.locator('.sheet .chip', { hasText: '70%' }).click();
  await phone.locator('.sheet .chip', { hasText: '布丁' }).click();
  await phone.click('.sheet .primary');
  await phone.waitForTimeout(300);
  await phone.locator('.item', { hasText: '杨枝甘露' }).click();
  await phone.waitForSelector('.sheet.show');
  await phone.locator('.sheet .qty button', { hasText: '+' }).click();
  await phone.click('.sheet .primary');
  await phone.waitForTimeout(300);
  await phone.click('#cartbar button');
  await phone.waitForSelector('.sheet.show');
  await phone.fill('.sheet textarea', '不要吸管');
  await phone.click('.sheet .primary');
  await phone.waitForSelector('.status .num');
  const q = (await phone.textContent('.status .num')).trim();
  check('顾客拿到单号', /^Q\d+$/.test(q), q);

  // 平板 3 秒内出现新单（NEW + 提示条）
  const card = tablet.locator(`.card[data-q="${q}"]`);
  await card.waitFor({ timeout: 8000 });
  await tablet.waitForTimeout(300);
  check('新单在「新订单」列', (await tablet.locator(`.col.received .card[data-q="${q}"]`).count()) === 1);
  check('新单闪烁 + NEW', (await card.getAttribute('class')).includes('fresh') && (await card.textContent()).includes('NEW'));
  check('提示条', (await tablet.textContent('.toast')).includes(q) && (await tablet.textContent('.toast')).includes('3 杯'), await tablet.textContent('.toast'));
  const text = await card.textContent();
  check('卡片内容（中日文、规格、备注、金额）',
    text.includes('茉香奶绿') && text.includes('ジャスミングリーンミルクティー') && text.includes('+布丁（プリン）') && text.includes('杨枝甘露')
    && text.includes('×2') && text.includes('桌 5') && text.includes('店内') && text.includes('不要吸管') && text.includes('¥2,450'), text);
  check('改过的选项标黄', (await card.locator('.opt.chg', { hasText: '少冰' }).count()) === 1 && (await card.locator('.opt.chg', { hasText: '70%' }).count()) === 1);
  await tablet.screenshot({ path: shots + '/s2-new.png' });

  // 已录入收银 → 顾客手机显示制作中
  await card.locator('.go').click();
  await tablet.locator(`.col.accepted .card[data-q="${q}"]`).waitFor();
  await phone.waitForFunction(() => document.querySelector('.status .msg').textContent.includes('正在制作'), null, { timeout: 8000 });
  check('已录入 → 顾客看到制作中', true);
  await tablet.screenshot({ path: shots + '/s3-accepted.png' });

  // 做好了 → 顾客手机提示取餐
  await tablet.locator(`.card[data-q="${q}"] .go`).click();
  await tablet.locator(`.col.ready .card[data-q="${q}"]`).waitFor();
  await phone.waitForSelector('.status .num.ready', { timeout: 8000 });
  check('做好了 → 顾客看到可取餐', (await phone.textContent('.status .msg')).includes('做好了'));
  await phone.screenshot({ path: shots + '/s4-phone-ready.png' });

  // 退回一步再前进
  await tablet.locator(`.card[data-q="${q}"] .minor`).click();
  await tablet.locator(`.col.accepted .card[data-q="${q}"]`).waitFor();
  check('可以退回', true);
  await tablet.locator(`.card[data-q="${q}"] .go`).click();
  await tablet.locator(`.col.ready .card[data-q="${q}"]`).waitFor();

  // 已取走 → 从看板消失，今日记录里有
  await tablet.locator(`.card[data-q="${q}"] .go`).click();
  await tablet.waitForFunction((qq) => !document.querySelector(`.card[data-q="${qq}"]`), q);
  check('取走后从看板消失', true);
  check('今日统计', (await tablet.textContent('header .stats')).includes('¥'), await tablet.textContent('header .stats'));
  await tablet.click('header .tool:has-text("今日记录")');
  await tablet.waitForSelector('.panel table');
  check('今日记录里有这单', (await tablet.textContent('.panel table')).includes(q) && (await tablet.textContent('.panel table')).includes('已取走'));
  await tablet.click('.panel .x');

  // 取消（带原因）→ 顾客看到原因
  const placed = await publicRpc('chali_place_order', { p_store: 'chalichali-01', p_dining: 'takeOut', p_items: [{ itemID: 'assam', size: 'M', temp: 'hot', sweetness: 100, toppingIDs: [] }] });
  const q2 = 'Q' + placed.number;
  await tablet.locator(`.card[data-q="${q2}"]`).waitFor({ timeout: 8000 });
  check('HOT 显示在卡片上', (await tablet.locator(`.card[data-q="${q2}"] .opt.chg`, { hasText: 'HOT' }).count()) === 1);
  promptAnswer = '阿萨姆卖完了';
  await tablet.locator(`.card[data-q="${q2}"] .minor:has-text("取消")`).click();
  await tablet.waitForFunction((qq) => !document.querySelector(`.card[data-q="${qq}"]`), q2);
  const st = await publicRpc('chali_order_status', { p_order: placed.id });
  check('取消并带原因', st.status === 'cancelled' && st.cancelReason === '阿萨姆卖完了', JSON.stringify(st));

  // 售罄：杨枝甘露 → 顾客页面显示售罄
  await tablet.click('header .tool:has-text("售罄")');
  await tablet.waitForSelector('.panel .so');
  await tablet.locator('.so button', { hasText: '杨枝甘露' }).click();
  await tablet.screenshot({ path: shots + '/s5-soldout.png' });
  await tablet.click('.panel .big');
  await tablet.waitForFunction(() => !document.querySelector('.panel'));
  // 前面的测试已经把「草莓芝士」标成售罄，平板会接着用，所以这里是 2 款
  check('售罄按钮显示数量', (await tablet.textContent('header')).includes('售罄（2）'), await tablet.textContent('header'));
  await phone.click('.status .secondary');
  await phone.waitForSelector('.item');
  check('顾客页面显示售罄', (await phone.locator('.item.soldout', { hasText: '杨枝甘露' }).count()) === 1);

  // 暂停接单 → 顾客页面提示到柜台点单
  await tablet.click('header .pill');
  await tablet.waitForFunction(() => document.querySelector('header .pill').textContent.includes('已暂停'));
  await phone.reload();
  await phone.waitForSelector('.notice.warn');
  check('暂停后顾客页面提示', (await phone.textContent('.notice.warn')).includes('柜台'));
  await tablet.click('header .pill');
  await tablet.waitForFunction(() => document.querySelector('header .pill').textContent.includes('接单中'));
  const after = await publicRpc('chali_get_menu', { p_store: 'chalichali-01' });
  check('恢复接单后售罄还在', after.accepting && after.menu.items.find((i) => i.id === 'yangzhi').soldOut === true);

  // 二维码海报
  const poster = await (await browser.newContext({ viewport: { width: 700, height: 1000 } })).newPage();
  watch(poster);
  await poster.goto(PAGE + 'poster.html?t=3');
  await poster.waitForSelector('#qr svg');
  check('海报有二维码和桌号', (await poster.locator('#qr svg rect, #qr svg path').count()) > 0 && (await poster.textContent('#url')).endsWith('?t=3'), await poster.textContent('#url'));
  await poster.screenshot({ path: shots + '/s6-poster.png' });

  // 密钥被换掉 → 回到设置页
  await tablet.evaluate(() => localStorage.setItem('chali-staff-key', 'changed'));
  await tablet.reload();
  await tablet.click('.overlay .big');
  await tablet.waitForSelector('.panel input[type=password]', { timeout: 8000 });
  check('密钥失效回到设置页', (await tablet.textContent('.err')).includes('密钥'));

  const real = errors.filter((e) => !/status of 4\d\d/.test(e));
  check('没有 JS 错误', real.length === 0, real.join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
