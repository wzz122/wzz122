// 录演示视频的画面：手机（顾客）+ 平板（接单屏）一起自动操作，连续截图，记下每一步的时间点。
//   用法：node record.js <工作目录>     （先跑 ./start-stack.sh <工作目录>）
//   输出：<工作目录>/rec/{phone,tablet}/*.jpg + timeline.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WORK = path.resolve(process.argv[2] || 'work');
const REC = path.join(WORK, 'rec');
const SITE = 'http://localhost:8081/';
const REST = 'http://localhost:3001';
const KEY = fs.readFileSync(path.join(WORK, 'staff_key.txt'), 'utf8').trim();
fs.rmSync(REC, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const markers = [];
const mark = (name) => { markers.push({ name, t: Date.now() }); console.log('mark', name); };

// 页面里加点击波纹和橙色圈（会被截进画面）
function helpers() {
  const ripple = (x, y) => {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;left:${x - 26}px;top:${y - 26}px;width:52px;height:52px;border-radius:50%;background:rgba(255,140,0,.35);border:4px solid rgba(240,120,0,.95);pointer-events:none;z-index:2147483647;transition:transform .45s ease-out,opacity .45s ease-out;`;
    document.documentElement.appendChild(d);
    setTimeout(() => { d.style.transform = 'scale(1.7)'; d.style.opacity = '0'; }, 220);
    setTimeout(() => d.remove(), 800);
  };
  document.addEventListener('pointerdown', (e) => ripple(e.clientX, e.clientY), true);
  window.__ring = (el) => {
    const r = el.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = '__ring';
    d.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:4px solid #FF8C00;border-radius:14px;box-shadow:0 0 0 7px rgba(255,140,0,.22);pointer-events:none;z-index:2147483647;`;
    document.documentElement.appendChild(d);
  };
  window.__unring = () => document.querySelectorAll('.__ring').forEach((e) => e.remove());
}

// 连续截图（JPEG），记下每张的时间
function cast(page, name) {
  const dir = path.join(REC, name);
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  let i = 0;
  let run = true;
  const loop = (async () => {
    while (run) {
      const t = Date.now();
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 90, timeout: 700 });
        const file = `${name}/${String(i++).padStart(5, '0')}.jpg`;
        fs.writeFileSync(path.join(REC, file), buf);
        frames.push({ file, t });
      } catch (e) { /* 页面跳转时截不到，跳过 */ }
      const el = Date.now() - t;
      if (el < 50) await sleep(50 - el);
    }
  })();
  return { frames, stop: async () => { run = false; await loop; } };
}

async function tap(loc, wait = 700) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
  await sleep(250);
  await loc.click();
  await sleep(wait);
}
const ring = (loc) => loc.evaluate((e) => window.__ring(e));
const unring = (page) => page.evaluate(() => window.__unring());

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});

  // 二维码海报截图：给模拟相机页面和片头用
  const pp = await (await browser.newContext({ viewport: { width: 700, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  await pp.goto(SITE + 'poster.html?t=3');
  await pp.waitForSelector('#qr svg');
  await pp.locator('.sheet').screenshot({ path: path.join(WORK, 'site', 'poster-shot.png') });
  fs.copyFileSync(path.join(WORK, 'site', 'poster-shot.png'), path.join(WORK, 'poster-shot.png'));
  await pp.context().close();

  // 平板：接单屏（还没开始接单）
  const tctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5, locale: 'zh-CN' });
  await tctx.addInitScript(helpers);
  const tablet = await tctx.newPage();
  await tablet.goto(SITE + 'staff.html#k=' + KEY);
  await tablet.waitForSelector('.col.received .list');
  await tablet.click('header h1');   // 打开提示音（底部的提示条会消失）
  await sleep(1500);

  // 手机：先是锁屏一样的画面
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', isMobile: true });
  await pctx.addInitScript(helpers);
  const phone = await pctx.newPage();
  await phone.goto(SITE + 'scan.html');
  await sleep(800);

  const tc = cast(tablet, 'tablet');
  const pc = cast(phone, 'phone');
  await sleep(600);
  mark('start');

  // ① 开店：点「开始接单」
  mark('open');
  await sleep(1200);
  await ring(tablet.locator('header .pill'));
  await sleep(1600);
  await unring(tablet);
  await tap(tablet.locator('header .pill'), 2800);

  // ② 扫码
  mark('scan');
  await phone.evaluate(() => window.startScan());
  await sleep(3000);
  await tap(phone.locator('#open'), 300);
  await phone.waitForSelector('.item');
  await sleep(1300);

  // ③ 语言
  mark('lang');
  await sleep(600);
  await tap(phone.locator('.lang button', { hasText: 'EN' }), 1700);
  await tap(phone.locator('.lang button', { hasText: '中文' }), 1500);
  await tap(phone.locator('nav.cats button', { hasText: '鲜果时光' }), 1500);
  await tap(phone.locator('nav.cats button', { hasText: '珍珠奶茶' }), 1000);

  // 「第一次来？」常见问题
  mark('faq');
  await tap(phone.locator('.faqbtn'), 4200);
  await tap(phone.locator('.sheet .close'), 700);

  // ④ 选规格：茉香奶绿 L 少冰 70% +布丁
  mark('pick');
  await tap(phone.locator('.item', { hasText: '茉香奶绿' }), 1000);
  await tap(phone.locator('.sheet .chip', { hasText: '少冰' }), 600);
  await tap(phone.locator('.sheet .chip', { hasText: '70%' }), 600);
  await tap(phone.locator('.sheet .chip', { hasText: '布丁' }), 800);
  await ring(phone.locator('.sheet .primary'));
  await sleep(1300);
  await unring(phone);
  await tap(phone.locator('.sheet .primary'), 900);

  // ⑤ 再加一杯杨枝甘露 ×2，写备注，下单
  mark('cart');
  // 下单前先停住平板的拉取，让「手机出现单号」和「平板叮咚」分成两个镜头
  await tablet.evaluate(() => { clearInterval(pollTimer); pollTimer = null; });
  await tap(phone.locator('.item', { hasText: '杨枝甘露' }), 900);
  await tap(phone.locator('.sheet .qty button', { hasText: '+' }), 500);
  await tap(phone.locator('.sheet .primary'), 900);
  await tap(phone.locator('#cartbar button'), 1100);
  await phone.locator('.sheet textarea').click();
  await phone.keyboard.type('不要吸管', { delay: 160 });
  await sleep(700);
  await phone.locator('.sheet textarea').blur();
  await tap(phone.locator('.sheet .primary'), 200);
  await phone.waitForSelector('.status .num');

  // ⑥ 手机上的单号
  mark('number');
  await sleep(700);
  await ring(phone.locator('.status .card').first());
  await sleep(3600);
  await unring(phone);

  // ⑦ 平板叮咚
  await tablet.evaluate(() => startPolling());
  const q1 = tablet.locator('.card[data-q="Q1"]');
  await q1.waitFor({ timeout: 10000 });
  mark('ding');
  await sleep(2000);
  for (const el of await q1.locator('.opt.chg').all()) await ring(el);
  await sleep(3800);
  await unring(tablet);

  // ⑧ 顾客到柜台报单号，店员录入原收银系统
  mark('enter');
  await ring(q1.locator('.qno'));
  await sleep(6600);
  await unring(tablet);

  // ⑨ 已录入收银 → 顾客手机「制作中」
  mark('accept');
  await ring(q1.locator('.go'));
  await sleep(1100);
  await unring(tablet);
  await tap(q1.locator('.go'), 300);
  await phone.waitForFunction(() => document.querySelector('.status .msg').textContent.includes('正在制作'), null, { timeout: 8000 });
  await sleep(2600);

  // ⑩ 做好了 → 顾客手机提醒取餐
  mark('ready');
  await tap(tablet.locator('.card[data-q="Q1"] .go'), 300);
  await phone.waitForSelector('.status .num.ready', { timeout: 8000 });
  await sleep(3400);

  // ⑪ 取走；另一位客人用英文点了 Q2
  mark('done');
  await tap(tablet.locator('.card[data-q="Q1"] .go'), 1500);
  await fetch(REST + '/rpc/chali_place_order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_store: 'chalichali-01', p_dining: 'takeOut', p_items: [
      { itemID: 'mango-yogurt', size: 'M', temp: 'normalIce', sweetness: 100, toppingIDs: [], quantity: 1 },
      { itemID: 'lemon-black', size: 'L', temp: 'lessIce', sweetness: 50, toppingIDs: ['nata'], quantity: 1 },
    ], p_note: 'No straw, please' }),
  });
  await tablet.locator('.card[data-q="Q2"]').waitFor({ timeout: 10000 });
  mark('ding2');
  await sleep(5200);

  // 客人当面用外语说名字 → 查饮品
  mark('lookup');
  await tap(tablet.locator('header .tool', { hasText: '查饮品' }), 600);
  await tablet.locator('#lookupQ').pressSequentially('まんご', { delay: 300 });
  await sleep(2600);
  await tablet.locator('#lookupQ').fill('');
  await tablet.locator('#lookupQ').pressSequentially('pomelo', { delay: 220 });
  await sleep(2600);
  await tap(tablet.locator('.panel .x'), 700);

  // ⑫ 售罄
  mark('soldout');
  await tap(tablet.locator('header .tool', { hasText: '售罄' }), 1300);
  await tap(tablet.locator('.so button', { hasText: '杨枝甘露' }), 900);
  await ring(tablet.locator('.panel .big'));
  await sleep(900);
  await unring(tablet);
  await tap(tablet.locator('.panel .big'), 900);
  await tap(phone.locator('.status .secondary'), 1200);
  await phone.waitForSelector('.item');
  await tap(phone.locator('nav.cats button', { hasText: '鲜果时光' }), 900);
  const sold = phone.locator('.item.soldout', { hasText: '杨枝甘露' });
  await sold.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await sleep(500);
  await ring(sold);
  await sleep(2600);
  await unring(phone);

  // ⑬ 今日记录
  mark('history');
  await tap(tablet.locator('header .tool', { hasText: '今日记录' }), 1200);
  await ring(tablet.locator('.panel p').first());
  await sleep(3800);
  await unring(tablet);
  mark('end');
  await sleep(400);

  await tc.stop();
  await pc.stop();
  fs.writeFileSync(path.join(REC, 'timeline.json'), JSON.stringify({ markers, tablet: tc.frames, phone: pc.frames }, null, 0));
  console.log('frames: tablet', tc.frames.length, 'phone', pc.frames.length, 'seconds', ((markers.at(-1).t - markers[0].t) / 1000).toFixed(1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
