# ColorMatch v1 核心实现

本目录是架构方案（`../COLORMATCH_ARCHITECTURE_V1.md`）M1–M5 模块的完整实现，
由 Claude 在云端环境完成。云端无 Swift 工具链与 ColorMatch 原工程，因此采用
「Python 参照实现验证算法 + Swift 镜像移植 + golden 交叉校验」的路线，
Swift 侧的最终编译与测试在 Mac 上执行（见下方 Runbook）。

## 目录结构

```text
colormatch/
├── README.md                 # 本文件
├── verify_on_mac.sh          # Mac 一键验证脚本
├── reference/                # Python 参照实现（算法规格的可执行版本）
│   ├── grade_math.py         # 统计/匹配/渲染全管线，与 Swift 逐公式一致
│   ├── acceptance_test.py    # 闭环收敛验收（已在云端通过，20/20）
│   └── gen_goldens.py        # 生成 Swift golden 测试文件
└── ColorMatchCore/           # Swift Package（挂进 ColorMatchIOS 工程即用）
    ├── Package.swift
    ├── Sources/
    │   ├── ColorEngine/         # M1 前置：统计、双图仿色、渲染管线（纯 Swift）
    │   ├── LUTBuilder/          # M1：参数 → 3D LUT（预览/CUBE 共用一份实现）
    │   ├── PreviewRenderer/     # M1：CIColorCube 渲染 + CGImage 适配（Apple 平台）
    │   ├── StyleKnowledgeBase/  # M3：5 个首发风格族 + 签名匹配
    │   ├── PresetExporter/      # M4：Lightroom XMP + 中文风格报告
    │   ├── RecipeStore/         # M2：SwiftData 配方库（Apple 平台）
    │   └── EntitlementService/  # M5：免费限次（平台无关）+ StoreKit 2 Pro
    └── Tests/                   # 5 个测试 target，含跨语言 golden 校验
```

## 已在云端验证的部分

- **算法闭环验收**（`reference/acceptance_test.py`）：4 组合成风格对 ×
  5 个收敛维度全部通过。仿色 → LUT 应用后，白平衡/曝光/对比/色度/区域色偏
  与参考图的距离全部收敛到阈值内；恒等 LUT 零误差；匹配器逐位确定。
- **不动点精修**：单发前馈估计因参数耦合会过冲（首轮验收 12/20 失败），
  加入「应用参数 → 重测统计 → 残差反馈」的 2 轮精修后全部通过。
  这是本实现的核心机制，Swift 侧逐行镜像。
- **Swift 语法门禁**：27 个 .swift 文件 tree-sitter 解析零错误。
- **风格匹配逻辑**：打分公式在 Python 镜像下验证了全部测试预期
  （三种典型参数各自命中正确风格族，且分差明显）。

## 需要在 Mac 上完成的验证（Runbook）

```sh
cd colormatch
./verify_on_mac.sh          # = python3 验收 + swift test 全量
```

`swift test` 里最关键的是 `CrossValidationTests`：它用 Python 生成的
golden vectors 逐字段校验 Swift 移植（统计层容差 1e-3、参数层 0.05、
LUT 层 2e-3）。任何一侧改动算法常数，这组测试立刻失败。

之后接入工程：

1. Xcode 打开 ColorMatchIOS 工程 → File → Add Package Dependencies →
   Add Local… → 选择 `colormatch/ColorMatchCore`。
2. App target 链接需要的 library（ColorEngine、LUTBuilder、PreviewRenderer、
   StyleKnowledgeBase、PresetExporter、RecipeStore、EntitlementService）。
3. 用 6–10 组真实图对跑架构文档 M1 验收：App 预览 vs XMP 导入
   Lightroom 的渲染，目视比对肤色/天空/中性灰。

## 端到端调用示例（App 侧主流程）

```swift
import ColorEngine
import EntitlementService
import LUTBuilder
import PresetExporter
import PreviewRenderer
import StyleKnowledgeBase

// 1. 输入（CGImage 来自 PhotosPicker）
let source = try CGImageAdapter.rgbaImage(from: sourceCG)       // 统计用，长边 ≤1024
let reference = try CGImageAdapter.rgbaImage(from: referenceCG)

// 2. 限次检查（免费每日 3 次）
let limiter = UsageLimiter(store: UserDefaults.standard)
let today = UsageLimiter.dayString(for: .now)
guard limiter.canPerformMatch(day: today, isPro: entitlement.isPro) else {
    // 弹 paywall
    return
}

// 3. 本地仿色（确定性，无网络）
let params = ColorMatcher.matchImages(source: source, reference: reference)
limiter.recordMatch(day: today)

// 4. 预览（全分辨率导出同一条路径，换全尺寸 CGImage 即可）
let lut = LUT(params: params)
let previewCG = try PreviewRenderer().apply(lut, to: sourceCG)

// 5. 风格判定 + 报告 + XMP
let library = try StyleLibrary.bundled()
let match = library.match(params)
let xmp = XMPWriter.xmp(params: params, presetName: presetName, uuid: recipe.exportUUID)
let report = StyleReport.markdown(
    params: params, match: match, presetName: presetName,
    options: .init(fullReport: entitlement.isPro)
)
// share sheet 导出 xmp + report；导出前走 limiter.canExportXMP(isPro:)
```

## 设计要点（为什么这么做）

- **一份 LUT 三个消费者**：`LUTBuilder` 的输出同时驱动 CIColorCube 预览、
  CPU 批量应用和 `.cube` 文本导出（v1.1），"预览 = 导出"由架构保证而不是靠测。
- **AI 不碰参数**：`GradeParameters.clamped()` 是 AI 微调建议的强制入口，
  云端建议只能在合法范围内修参数（v1.1 的 M6 接这里）。
- **报告 = 教学变现**：`StyleReport` 免费版只给风格名 + 一句话，
  Pro 给完整解读——付费墙卡的是深度不是流程。
- **合成图交叉校验**：Swift 与 Python 用同一套确定性合成图与
  floor(x+0.5) 量化，golden 校验才有逐位意义。

## 尚未实现（按架构文档属 v1.1 / App 层）

- SwiftUI 界面接线（选图、预览滑杆、导出 sheet、paywall 页）——
  属 App target，不在 Core 包范围。
- M6：AIAdvisor 协议的云端实现 + Supabase Edge Function 代理。
- CUBE 导出的 UI 入口（`LUT.cubeFileText` 已实现并有测试）。
