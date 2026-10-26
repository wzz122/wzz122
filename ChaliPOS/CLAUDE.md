# ChaliPOS（茶里茶里）项目说明

给在这个目录里工作的 Claude Code 会话看的背景和约定。用户是这家奶茶店的店员（不是老板），中文母语，在日本。和用户交流用中文。

## 这是什么

- `ChaliPOS.swiftpm/`：iPad 点单收银 App（SwiftUI，Swift Playgrounds / Xcode App 包，iOS 16+）。
- `QROrder/`：扫码点单。Supabase SQL（`supabase/migrations/`）、顾客手机页面（`web/`，单个 HTML）、本地测试（`tests/`）。
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

## 现状和待办（2026-10-26）

1. **App 里的初始菜单是旧的猜测**（`Model/SeedMenu.swift`）。真实菜单已经从店里菜单屏照片录入在 `MenuTrainer/chali-menu.html` 的 `RAW` / `TOPPINGS` 里（48 款，含左右列位置）。要同步到 SeedMenu、`QROrder/tests/published_menu.json` 和测试。注意小料日文：椰子冻 = ココナッツプリン，西米露 = ミニタピオカ。
2. **特饮里榴莲那款的中文名被售罄贴纸挡住**（ドリアンマンゴー，M 780），暂写「榴莲芒芒」，等用户确认。
3. **扫码点单还没上线**：需要 Supabase 项目和顾客页面的托管（建议 GitHub Pages）。用户的 Supabase 组织里目前只有一个项目 LifePilot。建项目、建仓库前要先问用户。
4. **打印机**：店里有一台 EPSON（看起来是 TM 系列热敏小票机，多数不支持 AirPrint）。App 现在用 AirPrint，等用户拍型号贴纸后考虑加 ePOS-Print（局域网 HTTP，可带钱箱）。杯贴标签机店里还没有。
5. **用户最新的方向**：不换店里原来的收银系统（继续用它输入和记录），先做顾客自助「点单卡」：顾客扫码或用柜台平板看清每款的信息（标配珍珠、甜度能不能调、能不能做热等）并选好规格，生成中日双语点单卡给店员看，店员照着输入原系统。还在等用户回答：每款的标配小料和可选规则、原系统的输入顺序、用顾客手机还是柜台平板。
