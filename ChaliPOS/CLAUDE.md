# ChaliPOS（茶里茶里）项目说明

给在这个目录里工作的 Claude Code 会话看的背景和约定。用户是这家奶茶店的店员（不是老板），中文母语，在日本。和用户交流用中文。

## 这是什么

- `ChaliPOS.swiftpm/`：iPad 点单收银 App（SwiftUI，Swift Playgrounds / Xcode App 包，iOS 16+）。
- `QROrder/`：扫码点单。Supabase SQL（`supabase/migrations/`）、顾客手机页面（`web/index.html`）、柜台网页接单屏（`web/staff.html`）、真实菜单（`web/menu.js`）、二维码海报（`web/poster.html`）、本地测试（`tests/`）、演示视频脚本（`demo-video/`）。试用方案见 `QROrder/试用方案.md`。
- `MenuTrainer/chali-menu.html`：店员背菜单用的网页（48 款饮品的中日文名、分类、价格、练习）。已发布为 Artifact：https://claude.ai/artifact/EN1DkN75mRj49zUMWPb2Cz （这个文件是它的源码，没有 `<html>`/`<head>`，发布时会自动包上）。
- `CoreTests/`：Model 层单元测试，`Sources/ChaliCore` 是指向 `../../ChaliPOS.swiftpm/Model` 的符号链接。
- 设计文档（Claude Docs）：https://claude.ai/artifact/YS2A6axKbKEJvzHHhiQY6t

## 常用命令

```bash
open ChaliPOS.swiftpm                       # Xcode 打开 App，选 iPad 运行
cd CoreTests && swift test                  # Model 层测试（Mac / Linux 都能跑）
cd QROrder/tests && ./run_local.sh          # 扫码点单：Postgres + PostgREST + Playwright（需要 Docker、node、playwright）
```

CI：`.github/workflows/chalipos.yml`（仓库根目录）。每次推送跑 Linux 测试、扫码点单测试、iOS SDK 类型检查和构建；提交信息带 `[screenshots]` 时在 iPad 模拟器截图并提交到 `screenshots/`。

## 约定

- `Model/` 只依赖 Foundation（要能在 Linux 上编译测试），SwiftUI / UIKit 只放在其他目录。
- 部署目标是 iOS 16：一个 ViewBuilder 里最多 10 个子视图，超过要拆成小视图；不用 `@Observable`、`ContentUnavailableView` 等 iOS 17 API。
- 界面文字、注释用中文；顾客看到的（小票、扫码页面）以日文为主。
- 截图模式：启动参数 `-screenshot <页面>`（order / options / checkout / orders / qr / qrposter / soldout / close / reports / menu），用临时目录和示例数据，不碰真实数据。
- 扫码点单的价格以服务器按 iPad 发布的菜单重新计算为准；顾客端传来的价格一律不用。

## 现状和待办（2026-10-27）

**方向已定（2026-10-27 用户）**：用最低成本让老板试用扫码点单。顾客扫码手机点单 → 柜台平板网页接单屏（`web/staff.html`）看单 → 店员手动录进老板原来的收银软件（黄色的那个）。不用 iPad App。

1. **最小试用版已完成并测试**（本地 Docker 84 项全过，`tests/run_local.sh`）；演示视频 v1（2:01，中文字幕）已交付，在云盘 `06_应用自动生成/项目文档/茶里茶里扫码点单/`。
2. **还没上线**：要在用户的 Supabase（免费版，目前只有 LifePilot 一个项目）建 `chalichali` 免费项目（东京），建公开仓库 `wzz122/chalichali` 放 `web/` 开 GitHub Pages。**等用户同意再做**。上线后把真实地址写进 `web/config.js`（`orderUrl` 用来生成二维码），出打印用海报。
3. **菜单规则是按常见做法猜的**（见 `web/menu.js` 开头和 `试用方案.md`）：只有珍珠奶茶能做热、冰沙不能调冰、都能调甜度加小料、店内外同价。等用户在店里确认。
4. **特饮里榴莲那款的中文名被售罄贴纸挡住**（ドリアンマンゴー，M 780），暂写「榴莲芒芒」，等用户确认。
5. iPad App 的初始菜单还是旧的猜测（`Model/SeedMenu.swift`），试用版用不到；以后要用 App 时再从 `web/menu.js` 同步。注意小料日文：椰子冻 = ココナッツプリン，西米露 = ミニタピオカ。
6. **打印机**（完整版才用到）：店里有一台 EPSON（看起来是 TM 系列热敏小票机，多数不支持 AirPrint）。App 现在用 AirPrint，等用户拍型号贴纸后考虑加 ePOS-Print（局域网 HTTP，可带钱箱）。杯贴标签机店里还没有。
7. 本机跑测试：Docker 用 Colima（`DOCKER_CONTEXT=colima-chumon`），playwright 装在 `~/.local/share/chali-tools`（设 `NODE_PATH`），浏览器用 `PW_EXE`（见 chumon 的 `output/demo-video/env.sh`）。
