// 用 web/menu.js（真实菜单）生成测试用的 published_menu.json：
// 和接单屏发布的格式一样，另外把「草莓芝士」标成售罄，用来测售罄。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/menu.js'), 'utf8'), sandbox);
const menu = JSON.parse(JSON.stringify(sandbox.window.CHALI_MENU));
menu.businessDay = '2026-10-27';
for (const i of menu.items) i.soldOut = i.id === 'straw-cheese';
fs.writeFileSync(path.join(__dirname, 'published_menu.json'), JSON.stringify(menu, null, 1) + '\n');
console.log('published_menu.json: ' + menu.items.length + ' items, ' + menu.toppings.length + ' toppings');
