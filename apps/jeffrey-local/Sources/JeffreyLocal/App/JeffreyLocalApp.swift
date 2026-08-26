import SwiftUI

@MainActor
final class JeffreyLocalModel: ObservableObject {
    @Published var status: AgentStatus = .unpaired
    @Published var pairingCode: String?
    @Published var backendAddress = UserDefaults.standard.string(forKey: "backendAddress") ?? ""
    @Published var obsidianVaultPath = UserDefaults.standard.string(forKey: "obsidianVaultPath") ?? ""
    @Published var detail = "先填写 Jeffrey PWA 的 HTTPS 地址"
    private var worker: Task<Void, Never>?

    func saveAndConnect() {
        guard let url = URL(string: backendAddress), url.scheme == "https" || url.host == "localhost" else { detail = "请输入有效的 HTTPS 地址"; return }
        UserDefaults.standard.set(backendAddress, forKey: "backendAddress")
        UserDefaults.standard.set(obsidianVaultPath, forKey: "obsidianVaultPath")
        worker?.cancel()
        worker = Task { await connect(baseURL: url) }
    }

    func beginPairing() {
        guard let url = URL(string: backendAddress) else { detail = "请先填写后端地址"; return }
        worker?.cancel()
        worker = Task {
            do {
                let backend = try HTTPBackendClient(baseURL: url)
                let invitation = try await backend.beginPairing()
                pairingCode = invitation.code; detail = "请在手机 PWA 的“我的 Mac”中输入此码"
                while !Task.isCancelled && invitation.expiresAt > Date() {
                    do { _ = try await backend.finishPairing(invitation); pairingCode = nil; await connect(baseURL: url); return }
                    catch { try? await Task.sleep(for: .seconds(3)) }
                }
                pairingCode = nil; detail = "配对码已过期，请重新生成"
            } catch { detail = "无法连接 Jeffrey 后端" }
        }
    }

    func pause() { worker?.cancel(); worker = nil; status = .paused; detail = "已暂停，不会领取新任务" }

    private func connect(baseURL: URL) async {
        do {
            let backend = try HTTPBackendClient(baseURL: baseURL)
            let process = try AppServerProcess.start()
            let codex = CodexAppServerClient(transport: WebSocketRPCTransport(appServer: process))
            let coordinator = TaskCoordinator(backend: backend, codex: codex)
            await coordinator.setConnected(true)
            status = .ready; detail = "只通过出站 HTTPS 连接，Codex 仅监听本机回环地址"
            while !Task.isCancelled {
                do { try await coordinator.runOnce(); status = await coordinator.status }
                catch BackendClientError.unpaired { status = .unpaired; detail = "需要与手机 PWA 配对"; return }
                catch { status = .error; detail = "Codex 或后端暂时不可用" }
                try? await Task.sleep(for: .seconds(2))
            }
            await coordinator.pause()
        } catch AppServerProcessError.codexNotInstalled { status = .error; detail = "未找到本机 Codex，请先安装或更新 Codex" }
        catch { status = .offline; detail = "无法建立安全连接" }
    }
}

@main
struct JeffreyLocalApp: App {
    @StateObject private var model = JeffreyLocalModel()

    var body: some Scene {
        MenuBarExtra("Jeffrey Local", systemImage: "bubble.left.and.bubble.right.fill") {
            VStack(alignment: .leading, spacing: 11) {
                HStack { Text("Jeffrey Local").font(.headline); Spacer(); Text(model.status.label).font(.caption).foregroundStyle(.secondary) }
                TextField("https://你的-jeffrey-pwa.example", text: $model.backendAddress).textFieldStyle(.roundedBorder)
                TextField("Obsidian Vault 文件夹路径", text: $model.obsidianVaultPath).textFieldStyle(.roundedBorder)
                Text(model.detail).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if let code = model.pairingCode { Text(code).font(.system(size: 25, weight: .bold, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity) }
                HStack { Button("保存并连接") { model.saveAndConnect() }; Button("生成配对码") { model.beginPairing() } }
                Divider()
                Button("暂停") { model.pause() }
                Button("退出") { NSApplication.shared.terminate(nil) }
            }
            .padding(13)
            .frame(width: 310)
        }
    }
}
