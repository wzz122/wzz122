// swift-tools-version: 5.9

// 茶里茶里 iPad 点单收银 App（Swift Playgrounds / Xcode App 包）
// 在 iPad 的 Swift Playgrounds 或 Mac 的 Xcode 中直接打开 ChaliPOS.swiftpm 即可运行。
// 注意：Xcode / Swift Playgrounds 修改 App 设置时会重写这个文件。

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "ChaliPOS",
    platforms: [
        .iOS("16.0")
    ],
    products: [
        .iOSApplication(
            name: "ChaliPOS",
            targets: ["AppModule"],
            bundleIdentifier: "com.wzz122.ChaliPOS",
            teamIdentifier: "",
            displayVersion: "0.1",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .coffee),
            accentColor: .presetColor(.green),
            supportedDeviceFamilies: [
                .pad
            ],
            supportedInterfaceOrientations: [
                .landscapeRight,
                .landscapeLeft,
                .portrait,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        )
    ]
)
