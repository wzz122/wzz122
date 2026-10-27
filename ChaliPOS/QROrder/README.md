# 扫码点单（モバイルオーダー）

顾客扫柜台或桌上的二维码，用手机点单，**到柜台付款**；柜台接单、收款；做好后顾客手机上显示「できあがり / 可取餐」。

柜台有两种接法：

- **试用版（现在用这个）**：柜台平板打开网页接单屏 `web/staff.html`，店员照着录进店里原来的收银系统。什么都不用装，费用 0。说明见 [试用方案.md](试用方案.md)，演示视频的做法见 [demo-video/](demo-video/README.md)。
- **完整版**：收银 iPad 装 ChaliPOS App，直接在 App 里接单、收款、出杯贴（下面的流程图）。

| 文件 | 用途 |
|---|---|
| `web/index.html` | 顾客页面（日文 / 中文 / English） |
| `web/staff.html` | 柜台接单屏（网页）：新单响铃、已录入收银 → 做好了 → 已取走、取消、售罄、暂停、今日记录 |
| `web/menu.js` | 真实菜单 48 款（中日英）。接单屏开始接单时发布到服务器；改菜单只改这里 |
| `web/poster.html` | A5 二维码海报，可以带桌号 |
| `web/config.js` | 服务器地址和公开 key（部署时只改这个） |

![顾客手机页面](../screenshots/phone-order.jpg)

## 流程

```
顾客手机                         Supabase（数据库）                收银 iPad（ChaliPOS）
─────────                        ─────────────────                 ────────────────────
扫二维码 → 看菜单（含售罄） ←──── chali_get_menu  ←──────────────── 菜单 / 售罄有变化就自动发布
选规格、加入购物车、下单 ──────→ chali_place_order（服务器重新算价）
显示「Q12，请到柜台付款」                                          每 5 秒拉取，新单响铃 →「扫码」页
                                                                  顾客报 Q12 → 接单并收款 → 出杯贴
显示「取餐号 041 · 制作中」 ←──── chali_staff_update_order ←─────── 收款完成（accepted + 取餐号）
显示「できあがり」并震动    ←────────────────────────────────────── 订单页标记完成 / 扫码页点「做好了」
```

- 顾客页面：`web/index.html`（一个文件，日文为主，可切中文，不依赖任何外部库）+ `web/config.js`
- 数据库：`supabase/migrations/20261024120000_qr_order.sql`
- iPad：「扫码」页（`ChaliPOS.swiftpm/QROrder/`），设置在「管理 → 设置 → 扫码点单」

## 安全

- 表放在不对外公开的 `chali` schema，顾客只能调用 3 个函数（读菜单、下单、看自己订单的状态）。
- 价格、售罄、规格和温度是否允许，都在服务器上按 iPad 发布的菜单重新检查和计算，顾客端改不了价格。
- 店员用的函数（发布菜单、拉取订单、改状态）需要门店密钥；密钥只存在 iPad 上，数据库里只存哈希。
- anon / publishable key 本来就是公开的，放在网页里没问题。
- 防刷单：一单最多 30 杯；等待付款的单超过 30 张时暂停接新单；iPad 上可以随时「暂停接单」。

## 部署（约 20 分钟）

1. **Supabase**：新建项目（免费档即可，区域选 Tokyo `ap-northeast-1`）。
   打开 SQL Editor，粘贴执行 `supabase/migrations/20261024120000_qr_order.sql`，再执行：
   ```sql
   select chali.create_store('chalichali-01', '茶里茶里');
   ```
   返回的一串字符是**门店密钥**，等下填进 iPad。门店 ID 要和 iPad「设置」里的门店 ID 一样（默认 `chalichali-01`）。
2. 在 Project Settings → API 复制 **Project URL** 和 **anon（或 publishable）key**。
3. **顾客页面**：把 `web/config.js` 里的 `supabaseUrl`、`anonKey` 改成上一步的值，然后把 `web/` 目录发布到 GitHub Pages（例如新建仓库 `chalichali`，地址就是 `https://wzz122.github.io/chalichali/`）。
4. **柜台**（二选一）：
   - 试用版：平板浏览器打开 `https://…/staff.html#k=门店密钥`（只第一次需要，密钥会存在平板上并从地址栏去掉）→「开始」→「开始接单」。
   - 完整版：iPad 管理 → 设置 → 扫码点单：打开「启用」，填 Project URL、API key、门店密钥、顾客页面地址 → 「测试连接」显示成功后点「保存设置」。
5. 打印二维码：接单屏右上角「二维码」（或打开 `poster.html`），填桌号 → 打印，贴在柜台和桌上（顾客下单时自动带上桌号）。

费用：Supabase 免费档和 GitHub Pages 都够用。注意 Supabase 免费项目**连续 7 天没有访问会自动暂停**，店休超过一周后要在 Supabase 后台点一下恢复；营业期间 iPad 每 5 秒访问一次，不会暂停。

## 测试

```bash
cd ChaliPOS/QROrder/tests
./run_local.sh
```

用 Docker 起 Postgres + PostgREST（和 Supabase 同一套 REST 层），执行迁移（执行两次确认可以重复执行），然后：

- `api_test.py`：32 项数据库函数测试（错误密钥、售罄 / 下架 / 非法规格 / 非法温度 / 非法小料、服务器算价、店内用按税率换算、昨天的售罄自动失效、暂停接单、单号递增、接单 / 叫号 / 拒单）
- 确认 anon 不能直接读表、不能调用建店函数
- `web_test.js`：Playwright 在手机尺寸下完整点单，再用店员接口接单、叫号，检查顾客页面跟着变化（日文 / 中文 / 英文）
- `staff_test.js`：平板接单屏 + 顾客手机一起跑：新单响铃、已录入 → 做好了 → 已取走、退回、取消带原因、售罄、暂停、今日记录、密钥错误、二维码海报
- 测试菜单 `published_menu.json` 由 `gen_menu.js` 从 `web/menu.js` 生成

GitHub Actions 每次推送都会跑这一套。

## 以后可以加

- 在线预付（Square / Stripe / PayPay），付款后直接开始制作，不用排队付款
- 叫号屏：大屏显示「可取餐」的取餐号
- 菜单屏网页复用同一份发布的菜单（设计文档第 3 期）
