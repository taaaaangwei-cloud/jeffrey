// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "JeffreyLocal",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "JeffreyLocal", targets: ["JeffreyLocal"])],
    targets: [
        .executableTarget(name: "JeffreyLocal"),
        .testTarget(name: "JeffreyLocalTests", dependencies: ["JeffreyLocal"]),
    ]
)
