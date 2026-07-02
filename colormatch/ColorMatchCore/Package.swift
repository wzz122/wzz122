// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ColorMatchCore",
    defaultLocalization: "zh-Hans",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "ColorEngine", targets: ["ColorEngine"]),
        .library(name: "LUTBuilder", targets: ["LUTBuilder"]),
        .library(name: "PresetExporter", targets: ["PresetExporter"]),
        .library(name: "StyleKnowledgeBase", targets: ["StyleKnowledgeBase"]),
        .library(name: "PreviewRenderer", targets: ["PreviewRenderer"]),
        .library(name: "RecipeStore", targets: ["RecipeStore"]),
        .library(name: "EntitlementService", targets: ["EntitlementService"]),
    ],
    targets: [
        // 纯算法：图像统计 + 双图仿色 → GradeParameters（唯一跨模块契约）
        .target(name: "ColorEngine"),
        // GradeParameters → 3D LUT。预览（CIColorCube）与未来 CUBE 导出共用同一实现
        .target(name: "LUTBuilder", dependencies: ["ColorEngine"]),
        // XMP（Lightroom preset）+ 中文风格报告
        .target(
            name: "PresetExporter",
            dependencies: ["ColorEngine", "StyleKnowledgeBase"]
        ),
        // 风格族知识库：styles.json 加载 + 参数向量匹配
        .target(
            name: "StyleKnowledgeBase",
            dependencies: ["ColorEngine"],
            resources: [.process("Resources")]
        ),
        // Core Image 渲染层（Apple 平台专属，Linux 上编译为空）
        .target(name: "PreviewRenderer", dependencies: ["ColorEngine", "LUTBuilder"]),
        // SwiftData 本地配方库（Apple 平台专属）
        .target(name: "RecipeStore", dependencies: ["ColorEngine"]),
        // StoreKit 2 Pro 权益 + 平台无关的免费限次逻辑
        .target(name: "EntitlementService"),

        .testTarget(name: "ColorEngineTests", dependencies: ["ColorEngine", "LUTBuilder"]),
        .testTarget(name: "LUTBuilderTests", dependencies: ["LUTBuilder", "ColorEngine"]),
        .testTarget(
            name: "PresetExporterTests",
            dependencies: ["PresetExporter", "ColorEngine", "StyleKnowledgeBase"]
        ),
        .testTarget(
            name: "StyleKnowledgeBaseTests",
            dependencies: ["StyleKnowledgeBase", "ColorEngine"]
        ),
        .testTarget(name: "EntitlementServiceTests", dependencies: ["EntitlementService"]),
    ]
)
