# ColorMatch iOS 接线任务书（Claude → Codex 交接）

日期：2026-07-02
上游：`COLORMATCH_ARCHITECTURE_V1.md`（架构拍板）、`colormatch/README.md`（核心包说明）
执行环境：用户 Mac 本地（Codex CLI，可用 Xcode / 模拟器 / 真机）
项目：`/Users/wuzhuangzhuang/Documents/核心项目/ColorMatch`，scheme `ColorMatchIOS`

## 0. 背景一句话

云端 Claude 已完成 v1 核心五模块（仿色引擎/LUT/XMP/风格库/付费限次），
算法经 Python 参照实现闭环验收 20/20 通过，代码在
`wzz122/wzz122` 仓库 `claude/colormatch-architecture-qisz35` 分支的 `colormatch/` 目录。
你的任务：把它接进 ColorMatchIOS，跑通「选图 → 仿色 → 预览 → 报告+XMP 导出 → 配方」主流程。

## 1. 取码

```sh
cd /Users/wuzhuangzhuang/Documents/核心项目/ColorMatch
git clone --branch claude/colormatch-architecture-qisz35 --depth 1 \
  https://github.com/wzz122/wzz122.git /tmp/cm-drop
cp -R /tmp/cm-drop/colormatch ./colormatch
```

## 2. 任务清单（按序执行，每步有验收）

### T1 验证核心包

```sh
./colormatch/verify_on_mac.sh
```

- 预期：Python 验收全过（缺 numpy 可跳过该段）；`swift test` 全绿。
- Swift 代码在云端只过了 tree-sitter 语法门禁，没过真编译器。
  **如有编译错误：直接修复**，但修复不得改变数值行为
  （`CrossValidationTests` 是行为等价的裁判，它必须保持通过）。
- 验收：`swift test` 输出 0 failures。

### T2 挂包

- Xcode → ColorMatchIOS 工程 → Add Package Dependencies → Add Local…
  → `colormatch/ColorMatchCore`。
- App target 链接：ColorEngine、LUTBuilder、PreviewRenderer、
  StyleKnowledgeBase、PresetExporter、RecipeStore、EntitlementService。
- 验收：模拟器 Debug 构建成功。

### T3 主流程接线（v1 的产品心脏）

一条主线页面流：选原图+参考图 → 仿色 → 预览对比 → 导出。
端到端调用序列见 `colormatch/README.md`「端到端调用示例」，要点：

1. `CGImageAdapter.rgbaImage(from:)` 做输入适配（统计用长边 ≤1024）。
2. `ColorMatcher.matchImages(source:reference:)` 本地仿色（默认选项）。
   强匹配模式 `MatchOptions(strongMatch: true)` 仅 Pro 可选。
3. `LUT(params:)` + `PreviewRenderer().apply(_:to:)` 出预览；
   预览页至少提供 原图/结果 对比（并排或滑动对比均可）。
4. `StyleLibrary.bundled().match(params)` → `StyleReport.markdown(...)`
   生成报告；`XMPWriter.xmp(...)` 生成预设，经 share sheet 导出
   （文件名用 `XMPWriter.suggestedFileName`）。
5. 结果存 `RecipeStore.Recipe`（参考图缩略图 JPEG 长边 ≤256）；
   「我的配方」列表支持重新导出与删除。
- 验收：模拟器里全流程无死按钮；导出的 .xmp 能通过 Files 分享；
  杀 App 重开配方仍在。

### T4 付费墙接线

- `UsageLimiter(store: UserDefaults.standard)`：
  仿色前查 `canPerformMatch`，导出前查 `canExportXMP`，
  保存配方走 `RecipeRepository.save(isPro:maxFreeRecipes:)`。
- 撞墙时弹 paywall 页：`ProEntitlement`（StoreKit 2，
  product id `com.wzzsgdtc.colormatch.pro.lifetime`），
  含购买、恢复购买、价格展示。
- 免费版报告用 `StyleReport.Options(fullReport: false)`，Pro 用完整版。
- 验收：StoreKit Configuration 文件本地测试 购买/恢复/限次 三链路。

### T5 文案与旧代码清理

- 界面所有「AI 仿色」字样改为「智能仿色（本地）」；
  AI 相关文案仅保留在 v1.1 预告位（如设置页），不得暗示已有云端 AI。
- 旧的参数生成路径（如有 Web 移植残留）停用，统一走 ColorMatchCore。
- 验收：全局搜索无误导性 AI 文案；无重复参数生成代码路径。

### T6 M1 真实图对验收（最终验收）

- 6–10 组真实图对（含人像/夜景/逆光/大色偏），每组：
  App 预览截图 vs 同参数 XMP 导入 Lightroom 后的渲染截图，
  比对肤色/天空/中性灰三类区域。
- 产出：`colormatch/acceptance-photos/` 下留存对比截图 +
  一份 `T6_RESULTS.md`（每组一行：通过/偏差描述）。

## 3. 红线（违反即返工）

1. **不得单方面改 `ColorMatchCore` 的算法常数**
   （`ColorMatcher.Tuning`、`GradeRenderer.Tuning`、ImageStats 阈值）。
   必须改时：同步改 `reference/grade_math.py` → 重跑
   `reference/gen_goldens.py` → `swift test` 全绿，三步缺一不可。
2. 客户端不得出现任何 API key；v1 不接任何云端 AI 调用。
3. XMP 只能导出 `GradeParameters` 已有字段，不得加预览做不到的参数。
4. 商店/演示素材不得使用 YouTube 截图或竞品界面。
5. 不动 `核心项目` 父目录的其他项目。

## 4. 完成后回报

在 `colormatch/CODEX_REPORT.md` 写：T1–T6 各自结果、改过的文件清单、
遗留问题。若改过核心包，注明 diff 概要。该文件随分支推回
`wzz122/wzz122`（或由用户转交云端 Claude 复核下一轮）。
