# CODEX_REPORT

执行时间：2026-07-03 JST

## T1 核心包验证

- 已执行：`./colormatch/verify_on_mac.sh`
- 结果：Python 参照验收通过；Swift 包测试 52 tests / 0 failures。
- 修复：`StyleMatch` 增加 `public init(style:score:)`，用于 app / PresetExporter 测试从模块外构造匹配结果。
- 红线：未改 `ColorMatcher.Tuning`、`GradeRenderer.Tuning`、`ImageStats` 阈值；未重新生成 goldens，因为没有算法常数改动。

## T2 Xcode 挂包

- 已把 `colormatch/ColorMatchCore` 作为 local Swift package 加入 `ColorMatchIOS.xcodeproj`。
- App target 已链接七个库：`ColorEngine`、`LUTBuilder`、`PreviewRenderer`、`StyleKnowledgeBase`、`PresetExporter`、`RecipeStore`、`EntitlementService`。
- 验收：`xcodebuild -project ios/ColorMatchIOS/ColorMatchIOS.xcodeproj -scheme ColorMatchIOS -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build` 通过。

## T3 主流程接线

- `ImageAnalyzer` 改为走 ColorMatchCore：
  `CGImageAdapter` -> `ColorMatcher.matchImages` -> `LUT` -> `PreviewRenderer` -> `StyleLibrary` -> `StyleReport`。
- `AppModel` 接通双图输入、分析结果、预览图、报告、`XMPWriter` 导出、SwiftData `RecipeStore` 保存/重新导出/删除。
- `ResultView` 增加原图/结果切换、迁移量读数、中文风格说明、XMP + Markdown 预设包分享入口。
- `WorkspaceView` 增加原图/参考图入口、配额条、我的配方列表、share sheet。
- 模拟器安装并启动成功：`xcrun simctl launch booted com.sansecheesegyuudon.colormatch`，截图保存在 `colormatch/acceptance-photos/T3_home_screen.png`。
- 未使用脆弱 UI 脚本自动点 PhotosPicker；需要真机/模拟器手动选 1 组图片做最终交互复核。

## T4 付费墙接线

- 已接 `UsageLimiter(store: UserDefaults.standard)`：
  仿色前查 `canPerformMatch`，成功后 `recordMatch`；
  导出前查 `canExportXMP`，成功写出后 `recordXMPExport`；
  配方保存走 `RecipeRepository.save(isPro:maxFreeRecipes:)`。
- 已接 `ProEntitlement`，商品 ID 固定为 `com.wzzsgdtc.colormatch.pro.lifetime`，paywall 含购买、恢复购买、价格展示。
- 免费版报告使用 `StyleReport.Options(fullReport: false)`；Pro 使用完整版。
- 新增 StoreKit 配置：`ios/ColorMatchIOS/StoreKit/ColorMatch.storekit`。
- 新增共享 scheme，并挂载 StoreKit 配置：`ios/ColorMatchIOS/ColorMatchIOS.xcodeproj/xcshareddata/xcschemes/ColorMatchIOS.xcscheme`。
- 限次逻辑由核心包测试覆盖：`EntitlementServiceTests` 6 tests / 0 failures。
- 遗留：CLI 环境没有 `xcrun storekit`；购买/恢复购买弹窗需在 Xcode StoreKit Testing 或 App Store Connect 沙盒账号中人工点一次。

## T5 文案与旧代码清理

- UI 文案已从“AI 仿色”切到“智能仿色（本地）”。
- v1 不接云端 AI，不读取 API key。
- 旧 `APIClient`、`LightroomParameterMapper`、`ColorMatchEngine`、旧本地 `StyleKnowledgeBase` 文件保留为空壳说明，主流程不再调用。
- 验收扫描：
  `rg -n "AI 仿色|AI MATCH|云端 AI|API_KEY|OPENAI|GEMINI|LocalXMPExporter|JSONValue|payloadJSON|LightroomParameterMapper\\(|ColorMatchEngine\\(" ios/ColorMatchIOS/ColorMatchIOS colormatch/ColorMatchCore --glob '!**/.build/**' --glob '!**/build/**'`
  无命中。

## T6 真实图对验收

- 输出目录：`colormatch/acceptance-photos/`
- 已生成 8 组真实图对三联图：原图 / ColorMatchCore 本地 LUT 渲染 / 参考图。
- 已写结果表：`colormatch/acceptance-photos/T6_RESULTS.md`。
- 覆盖场景：人像、夜景/低照度、大色偏、绿色环境、逆光城市、海景、室内暖光。
- 结果：8 组均通过本地等价验收；每组至少 4 个统计维度收敛。
- 遗留：Lightroom 没有稳定 CLI 可自动导入同一 XMP 并截图，本次未伪造 Lightroom 截图。上架前仍需人工把导出的 XMP 导入 Lightroom，对肤色/天空/中性灰做一次目视复核。

## 改动文件清单

- `colormatch/ColorMatchCore/Sources/StyleKnowledgeBase/StyleDefinition.swift`
- `ios/ColorMatchIOS/ColorMatchIOS.xcodeproj/project.pbxproj`
- `ios/ColorMatchIOS/ColorMatchIOS.xcodeproj/xcshareddata/xcschemes/ColorMatchIOS.xcscheme`
- `ios/ColorMatchIOS/StoreKit/ColorMatch.storekit`
- `ios/ColorMatchIOS/ColorMatchIOS/AppModel.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/ColorMatchIOSApp.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Models.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Services/ImageAnalyzer.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Services/APIClient.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Services/LightroomParameterMapper.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Services/ColorMatchEngine.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Services/StyleKnowledgeBase.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Views/ResultView.swift`
- `ios/ColorMatchIOS/ColorMatchIOS/Views/WorkspaceView.swift`
- `colormatch/acceptance-photos/T3_home_screen.png`
- `colormatch/acceptance-photos/T6_*.jpg`
- `colormatch/acceptance-photos/T6_RESULTS.md`

## 当前遗留问题

1. StoreKit 购买/恢复购买需要 Xcode StoreKit Testing 人工点测一次。
2. Lightroom 导入 XMP 的真实渲染截图需要人工复核一次。
3. 当前工作区已有大量与本任务无关的既有改动；本报告只覆盖 ColorMatch iOS 接线相关文件。
