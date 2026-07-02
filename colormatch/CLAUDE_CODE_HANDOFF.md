# ColorMatch iOS 接线任务书（云端 Claude → 本地 Claude Code）

日期：2026-07-02
上游文档（按序读）：
1. `COLORMATCH_ARCHITECTURE_V1.md`（仓库根，架构与商业化拍板）
2. `colormatch/README.md`（核心包说明 + 端到端调用示例）
3. 本文件

执行环境：用户 Mac 本地 Claude Code（有 Xcode / 模拟器 / 真机 / swift 工具链）
项目：`/Users/wuzhuangzhuang/Documents/核心项目/ColorMatch`，scheme `ColorMatchIOS`

## 0. 背景一句话

云端 Claude 已完成 v1 核心五模块（仿色引擎 / LUT / XMP / 风格库 / 付费限次）。
算法经 Python 参照实现闭环验收 20/20 通过；Swift 侧过了 tree-sitter 语法门禁
和人工类型检查，但**没碰过真编译器**——这是你要补上的第一环。
你的任务：验证核心包，把它接进 ColorMatchIOS，跑通
「选图 → 仿色 → 预览 → 报告 + XMP 导出 → 配方」主流程。

## 1. 取码

```sh
cd /Users/wuzhuangzhuang/Documents/核心项目/ColorMatch
git clone --branch claude/colormatch-architecture-qisz35 --depth 1 \
  https://github.com/wzz122/wzz122.git /tmp/cm-drop
cp -R /tmp/cm-drop/colormatch ./colormatch
```

## 2. 开工前：安装常驻规则

把下面整段**追加**到项目根的 `CLAUDE.md`（没有就创建）。这是本项目的
永久纪律，之后每个本地会话都会自动加载：

```markdown
## ColorMatchCore 纪律（不可违反）

- Swift 算法实现与 colormatch/reference/grade_math.py 是镜像关系。
  修改任何算法常数（ColorMatcher.Tuning、GradeRenderer.Tuning、
  ImageStats 阈值、合成图生成、量化/百分位定义）必须三步走：
  1. 同步修改 reference/grade_math.py 的对应常数；
  2. cd colormatch/reference && python3 acceptance_test.py 必须全过，
     然后 python3 gen_goldens.py 重新生成 goldens；
  3. cd colormatch/ColorMatchCore && swift test 必须全绿
     （CrossValidationTests 是两个实现行为等价的裁判）。
- 量化一律 floor(x*255+0.5)（ColorMath.quantizeU8），禁止改成
  rounded()——舍入规则跨语言不一致会击穿 golden 校验。
- 客户端不得出现任何 API key；v1 不接任何云端 AI 调用。
- XMPWriter 只能导出 GradeParameters 已有字段，禁止加预览渲染
  不支持的参数（"预览 = 导出"是产品红线）。
- 界面文案：本地仿色不得写成"AI 仿色"；AI 字样只用于 v1.1 预告位。
- 商店/演示素材不得使用 YouTube 截图或竞品界面。
- 不动 核心项目/ 父目录下的其他项目。
```

## 3. 任务清单（按序执行，每步有验收）

### T1 验证核心包（最高优先级）

```sh
./colormatch/verify_on_mac.sh
```

- 预期：Python 验收全过（缺 numpy 可 pip3 装上或跳过该段）；`swift test` 全绿。
- 如有编译错误：直接修复，但修复不得改变数值行为——
  `CrossValidationTests` 保持通过即为证明。类型层面云端已人工排查过
  一轮（UserDefaults 扩展冲突、元组 keypath、@testable 可见性），
  剩余问题预计是小的签名/推断类错误。
- 验收：`swift test` 0 failures。把结果（全绿或修复记录）写进报告。

### T2 挂包

- Xcode → ColorMatchIOS → Add Package Dependencies → Add Local… →
  `colormatch/ColorMatchCore`。
- App target 链接：ColorEngine、LUTBuilder、PreviewRenderer、
  StyleKnowledgeBase、PresetExporter、RecipeStore、EntitlementService。
- 验收：模拟器 Debug 构建成功（xcodebuild 或 Xcode 均可）。

### T3 主流程接线（产品心脏）

一条主线：选原图 + 参考图 → 仿色 → 预览对比 → 导出。端到端调用序列
照 `colormatch/README.md` 的示例，要点：

1. `CGImageAdapter.rgbaImage(from:)` 做输入适配（统计用长边 ≤1024）。
2. `ColorMatcher.matchImages(source:reference:)` 本地仿色；
   强匹配 `MatchOptions(strongMatch: true)` 仅 Pro 可选。
3. `LUT(params:)` + `PreviewRenderer().apply(_:to:)` 出预览；
   预览页至少有 原图/结果 对比（并排或滑动对比均可）。
4. `StyleLibrary.bundled().match(params)` → `StyleReport.markdown(...)`
   生成报告；`XMPWriter.xmp(...)` 生成预设，share sheet 导出
   （文件名用 `XMPWriter.suggestedFileName`）。
5. 结果存 `RecipeStore.Recipe`（参考图缩略图 JPEG 长边 ≤256）；
   「我的配方」列表支持重新导出与删除。

现有 UI 能复用就复用（工程里已有选图/预览骨架），只替换数据通路；
不要为了整洁重写没坏的界面。

- 验收：模拟器全流程无死按钮；导出的 .xmp 能通过 Files 分享出来；
  杀 App 重开配方仍在。

### T4 付费墙接线

- `UsageLimiter(store: UserDefaults.standard)`：仿色前查
  `canPerformMatch`，导出前查 `canExportXMP`，存配方走
  `RecipeRepository.save(isPro:maxFreeRecipes:)`。
- 撞墙弹 paywall：`ProEntitlement`（StoreKit 2，product id
  `com.wzzsgdtc.colormatch.pro.lifetime`），含购买/恢复/价格展示。
- 免费版报告用 `StyleReport.Options(fullReport: false)`，Pro 完整版。
- 验收：建 StoreKit Configuration 文件，沙盒测 购买/恢复/限次 三链路。

### T5 文案与旧代码清理

- 全局把「AI 仿色」改为「智能仿色（本地）」；AI 字样只留 v1.1 预告位。
- 旧参数生成路径（如有 Web 移植残留）停用，统一走 ColorMatchCore。
- 验收：全局搜索无误导性 AI 文案；无重复参数生成代码路径。

### T6 真实图对验收（M1 最终验收）

- 6–10 组真实图对（人像/夜景/逆光/大色偏），每组：App 预览截图 vs
  同参数 XMP 导入 Lightroom 的渲染截图，比对肤色/天空/中性灰。
- Lightroom 一步需要用户操作：把 xmp 文件和操作说明整理好交给用户，
  等回传截图后完成比对结论。
- 产出：`colormatch/acceptance-photos/` 对比截图 + `T6_RESULTS.md`
  （每组一行：通过/偏差描述）。

## 4. 执行建议（Claude Code 特有）

- 先读完三份上游文档再动手；T1 不绿之前不碰 UI。
- T3/T4 动工前用计划模式过一遍现有工程结构，确认复用哪些现有 View。
- 每完成一个 T 提交一次 commit，信息里写明对应任务号。
- 遇到架构级取舍（如现有工程结构和 README 示例冲突）：按
  COLORMATCH_ARCHITECTURE_V1.md 的分层原则裁决，并在报告里记录理由。
- 可选：机械性大批量改动（如 T5 的全局文案替换）可以
  `codex exec` 派给 Codex 并行干，你负责复核。

## 5. 回报

完成后写 `colormatch/CLAUDE_CODE_REPORT.md`：T1–T6 各自结果、
改动文件清单、遗留问题；若改过核心包，附 diff 概要和三步走的执行记录。
把 colormatch/ 目录的变更（含报告）推回 `wzz122/wzz122` 的
`claude/colormatch-architecture-qisz35` 分支，供云端 Claude 复核下一轮；
ColorMatch 工程本身的改动照常提交到项目自己的仓库。
