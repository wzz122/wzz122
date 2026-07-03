# CLAUDE_CODE_REPORT

执行时间：2026-07-03 JST
执行者：本地 Claude Code

## 执行说明（重要前提）

接手时发现 Codex 已按同源任务书完成 T1–T6 全部接线并留有
`CODEX_REPORT.md`（2026-07-03 00:10）。本次执行因此调整为：
**独立复核 Codex 的每项验收 + 补齐它留下的缺口**，而非重做。
所有验收均重新实际运行过，不采信报告原文。

## 常驻规则

已按任务书第 2 节创建项目根 `CLAUDE.md`（原先不存在），
含 ColorMatchCore 三步走纪律、量化舍入红线、无 key、预览=导出等全部条款。

## T1 核心包验证 — 复核通过

- 重跑 `./colormatch/verify_on_mac.sh`：Python 参照验收 [3/3] 完成；
  `swift test` 52 tests / 0 failures。
- `CrossValidationTests` 三个用例（BaseSceneStats / MatchedParameters /
  WarmLUTSamples）确认在测试列表中并通过。
- Codex 唯一核心包改动为 `StyleMatch` 增加 `public init(style:score:)`，
  与 drop 原版 diff 逐行核实，未触碰任何算法常数，无需重生成 goldens。

## T2/T3 挂包与主流程 — 复核通过

- 重跑 `xcodebuild -scheme ColorMatchIOS -configuration Debug
  -sdk iphonesimulator build`：BUILD SUCCEEDED。
- 模拟器（iPhone 17）安装 + 启动冒烟：正常进入工作台，配额条
  （仿色 3/3、XMP 3/3、配方 0/5）、Pro 入口、原图/参考图选择均在。
  截图：`acceptance-photos/CC_smoke_launch.png`。
- 代码层核实：AppModel 走 CGImageAdapter → ColorMatcher → LUT →
  PreviewRenderer → StyleLibrary → StyleReport → XMPWriter → RecipeStore。
- 未做交互级验证（PhotosPicker 选图 → 导出 → 杀 App 重开），
  自动化点 PhotosPicker 脆弱，与 Codex 结论一致，留人工清单。

## T4 付费墙 — 复核通过（代码与配置层）

- `StoreKit/ColorMatch.storekit` 在，商品 ID
  `com.wzzsgdtc.colormatch.pro.lifetime` 正确；共享 scheme 已挂
  StoreKitConfigurationFileReference。
- canPerformMatch / canExportXMP / RecipeRepository.save /
  ProEntitlement / fullReport 分支接线点在 AppModel + ImageAnalyzer 中核实。
- 购买/恢复弹窗仍需 Xcode StoreKit Testing 人工点测一次（遗留）。

## T5 文案 — 复核通过

- 全局扫描「AI 仿色 / 云端 AI / API_KEY / OPENAI / GEMINI / sk-」：
  App 与核心包源码零命中；「智能仿色」文案在 AppModel / ImageAnalyzer 就位。
- 启动截图目视确认首页文案为「智能仿色工作台」。

## T6 — 补齐 Lightroom 人工验收材料（本次主要增量）

Codex 完成了 8 组本地等价验收但**没有交付 XMP 文件**，Lightroom
人工环节无从做起。本次补齐：

- 写了临时 Swift 工具（scratchpad，不入仓库），从 8 张验收三联图
  切出原图/参考图，走与 App 完全相同的
  `CGImageAdapter → ColorMatcher.matchImages → XMPWriter` 路径导出 XMP；
  同时用同一份参数经 `LUT + PreviewRenderer` 输出本地渲染基准图。
- 产物在 `acceptance-photos/xmp/`：每组 `_source.png`（导入 Lightroom）+
  `.xmp`（预设）+ `_local_render.png`（比对基准），共 24 文件。
- 用户操作说明：`acceptance-photos/xmp/LIGHTROOM_GUIDE.md`，
  已注明看点（肤色/天空/中性灰）与回传方式。
- 诚实声明：参数从三联图切片重算（原始图对未随仓库交付），与
  `T6_RESULTS.md` 表中数值有偏差属预期；因 XMP 与本地渲染基准使用
  同一份参数，「预览 = 导出」红线的比对仍然自洽有效。
- 状态：**等用户回传 Lightroom 截图后出最终比对结论**。

## 改动文件清单（本次会话）

- `CLAUDE.md`（新建，常驻规则）
- `colormatch/AGENT_BRIDGE.md`、`colormatch/CLAUDE_CODE_HANDOFF.md`
  （自 drop c21bd4f 拷入）
- `colormatch/acceptance-photos/CC_smoke_launch.png`（冒烟截图）
- `colormatch/acceptance-photos/xmp/`（8 XMP + 16 PNG + 操作说明）
- `colormatch/CLAUDE_CODE_REPORT.md`（本文件）
- 核心包与 App 源码本次零改动。

## 第二轮增补（2026-07-03 下午，用户反馈后）

用户裁定：Lightroom 比对不阻塞使用，推迟到上架前；StoreKit 点测尽量自动化。

- **发现并修复付费墙真 bug**：`ColorMatch.storekit` 为手写文件，schema
  非法（产品放在 `nonConsumables` 键而非 `products`+`type`、价格含货币
  符号 `¥1,500`）——此文件下商品永远加载不出来，paywall 会空转。
  已按 Xcode 标准格式重写（纯数字价格、JPN storefront）。
- 新增宿主化测试 target `ColorMatchIOSTests`（xcodeproj gem 注入）+
  测试计划 `ColorMatchIOSTests.xctestplan`：购买/恢复/权益持久化/回收
  四链路 SKTestSession 用例。
- **环境限制**：iOS 26.5 模拟器上经 CLI 跑 SKTestSession 装载配置必失败
  （SKInternalErrorDomain Code=3），依次排除了文件格式、宿主 App、
  模拟器重启、测试计划两种 schema 共四种方案，判定为运行时/CLI 限制。
  测试保留在仓库中（Xcode GUI 可直接跑），scheme 里默认 skipped
  以免 CLI `xcodebuild test` 挂死。
- 真机部署就绪：`DEVELOPMENT_TEAM = V8M45Z67M9` 已写入工程
  （原为空，装真机会卡签名）。
- 环境坑记录：项目位于 iCloud 同步目录，新写文件可能被冲突改名为
  `X 2.ext`（已清理一例 `CLAUDE 2.md`）。

## 遗留问题（人工清单）

1. 真机装机后手动过一遍：选图 → 仿色 → 导出 XMP → 杀 App 重开配方仍在
   （用户已安排 Codex 装机）。
2. StoreKit 购买弹窗：模拟器 CLI 不可行（见上）；正式验证在真机沙盒
   （需 App Store Connect 先建好内购商品）或 Xcode GUI 跑
   ColorMatchIOSTests。
3. Lightroom 比对推迟到上架前：材料已备好（`acceptance-photos/xmp/` +
   `LIGHTROOM_GUIDE.md`），不阻塞日常使用。
4. 工作区仍有与本任务无关的既有改动（server/、Dockerfile、package.json 等），
   未纳入本次提交，需另行处置。
