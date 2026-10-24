// swift-tools-version: 5.9

// 收银 App 的数据层（菜单、计价、税、购物车、报表、标签、CSV、日结、本地存储）单元测试。
// Sources/ChaliCore 是指向 ../../ChaliPOS.swiftpm/Model 的符号链接，和 App 用的是同一份代码。
// 在 Mac 或 Linux 上运行：cd ChaliPOS/CoreTests && swift test

import PackageDescription

let package = Package(
    name: "ChaliCore",
    targets: [
        .target(name: "ChaliCore", path: "Sources/ChaliCore"),
        .testTarget(name: "ChaliCoreTests", dependencies: ["ChaliCore"], path: "Tests/ChaliCoreTests"),
    ]
)
