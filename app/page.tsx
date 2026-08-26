"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { DevelopmentTaskCard } from "./components/development-task-card";
import { LocalComputerTaskCard } from "./components/local-computer-task-card";
import { LocalDeviceSettings } from "./components/local-device-settings";
import type { PublicDevelopmentTask } from "../lib/development/types";
import type { PublicLocalComputerTask } from "../lib/local-computer/types";

type View = "chat" | "settings";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Message = { id: string; sender: "user" | "assistant"; type: "text" | "image" | "sticker" | "audio" | "system"; content: string; mediaUrl: string | null; duration: number | null; createdAt: string };
type Status = { configured: boolean; mode?: "full" | "local" | "preview"; characterId?: string; conversationId?: string; error?: string; developmentAgent?: { enabled: boolean; configured: boolean }; localComputer?: { enabled: boolean; configured: boolean; deviceStatus?: "unpaired" | "offline" | "online" | "paused" | "incompatible" }; webPush?: { configured: boolean; publicKey?: string } };

const PREVIEW_STORAGE_KEY = "jeffrey-preview-messages-v1";

export default function Home() {
  const [view, setView] = useState<View>("chat");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>({ configured: false });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState("");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [memory, setMemory] = useState(true);
  const [push, setPush] = useState(false);
  const [proactive, setProactive] = useState(true);
  const [importing, setImporting] = useState(false);
  const [developmentTask, setDevelopmentTask] = useState<PublicDevelopmentTask | null>(null);
  const [localComputerTask, setLocalComputerTask] = useState<PublicLocalComputerTask | null>(null);
  const [localApprovalToken, setLocalApprovalToken] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const knowledgeRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onInstall);
    void loadChat();
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  function notify(text: string) { setToast(text); window.setTimeout(() => setToast(""), 3000); }

  async function loadChat() {
    try {
      const response = await fetch("/api/config/status", { cache: "no-store" });
      const config = await response.json() as Status;
      setStatus(config);
      if (!response.ok || !config.conversationId) return;
      if (config.mode === "preview") {
        const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
        if (stored) setMessages(JSON.parse(stored) as Message[]);
        return;
      }
      const historyResponse = await fetch(`/api/conversations/${config.conversationId}/messages?limit=50`, { cache: "no-store" });
      if (!historyResponse.ok) throw new Error("HISTORY_FAILED");
      const history = await historyResponse.json() as { messages: Message[] };
      setMessages(history.messages);
      if (config.developmentAgent?.enabled) {
        const taskResponse = await fetch("/api/development/tasks/active", { cache: "no-store" });
        const taskResult = await taskResponse.json() as { developmentTask?: PublicDevelopmentTask | null };
        if (taskResponse.ok) setDevelopmentTask(taskResult.developmentTask ?? null);
      }
      if (config.localComputer?.enabled && config.localComputer.configured) {
        const taskResponse = await fetch("/api/local-computer/tasks/active", { cache: "no-store" });
        const taskResult = await taskResponse.json() as { task?: PublicLocalComputerTask | null; approvalToken?: string };
        if (taskResponse.ok) { setLocalComputerTask(taskResult.task ?? null); setLocalApprovalToken(taskResult.approvalToken); }
      }
      if (config.mode === "local") {
        const proactiveResponse = await fetch("/api/proactive/settings", { cache: "no-store" });
        const proactiveResult = await proactiveResponse.json() as { settings?: { enabled: boolean } };
        if (proactiveResponse.ok && proactiveResult.settings) setProactive(proactiveResult.settings.enabled);
      }
    } catch {
      setStatus({ configured: false, error: "暂时无法连接 Jeffrey 的后端" });
    } finally { setLoading(false); }
  }

  async function send(text = message.trim(), type: Message["type"] = "text") {
    if (!text || sending) return;
    if (!status.configured || !status.characterId || !status.conversationId) return notify("后端尚未配置，请先在设置中完成连接");
    const optimistic: Message = { id: `local-${Date.now()}`, sender: "user", type, content: text, mediaUrl: null, duration: null, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setMessage(""); setAttachmentOpen(false); setSending(true);
    try {
      if (status.mode === "preview") {
        const history = messages.filter((item) => item.type === "text").slice(-30).map((item) => ({ role: item.sender, content: item.content }));
        const response = await fetch("/api/preview/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, history }) });
        const result = await response.json() as { reply?: string; error?: string };
        if (!response.ok || !result.reply) throw new Error(result.error ?? "SEND_FAILED");
        const reply: Message = { id: `preview-${Date.now()}`, sender: "assistant", type: "text", content: result.reply, mediaUrl: null, duration: null, createdAt: new Date().toISOString() };
        const next = [...messages, optimistic, reply];
        setMessages(next);
        window.localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(next));
        return;
      }
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId: status.characterId, conversationId: status.conversationId, message: text, type }) });
      const result = await response.json() as { pending?: boolean; userMessage?: Message; message?: Message; developmentTask?: PublicDevelopmentTask; localComputerTask?: PublicLocalComputerTask; localApprovalToken?: string; error?: string };
      if (!response.ok && response.status !== 202) throw new Error(result.error ?? "SEND_FAILED");
      if (result.pending && result.userMessage) {
        setMessages((current) => current.map((item) => item.id === optimistic.id ? result.userMessage as Message : item));
        const sourceTime = Date.parse(result.userMessage.createdAt);
        for (let attempt = 0; attempt < 45; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          const historyResponse = await fetch(`/api/conversations/${status.conversationId}/messages?limit=50`, { cache: "no-store" });
          if (!historyResponse.ok) continue;
          const history = await historyResponse.json() as { messages: Message[] };
          setMessages(history.messages);
          if (history.messages.some((item) => item.sender === "assistant" && Date.parse(item.createdAt) >= sourceTime)) return;
        }
        throw new Error("LOCAL_REPLY_TIMEOUT");
      }
      if (!result.message) throw new Error("SEND_FAILED");
      setMessages((current) => [...current, result.message as Message]);
      if (result.developmentTask) setDevelopmentTask(result.developmentTask);
      if (result.localComputerTask) { setLocalComputerTask(result.localComputerTask); setLocalApprovalToken(result.localApprovalToken); }
    } catch { notify("消息已保留，但 Jeffrey 暂时没有回复，请稍后重试"); }
    finally { setSending(false); }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void send(`[ 图片 ] ${file.name}`, "image");
    event.target.value = "";
  }

  async function importKnowledge(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".md"));
    event.target.value = "";
    if (!files.length) return notify("所选文件夹中没有 Markdown 文件");
    setImporting(true);
    try {
      let documents = 0;
      let chunks = 0;
      for (let index = 0; index < files.length; index += 20) {
        const batch = files.slice(index, index + 20);
        const form = new FormData();
        batch.forEach((file) => {
          form.append("files", file);
          form.append("paths", file.webkitRelativePath || file.name);
        });
        const response = await fetch("/api/knowledge/import", { method: "POST", body: form });
        const result = await response.json() as { documents?: number; chunks?: number; error?: string };
        if (!response.ok) throw new Error(result.error ?? "IMPORT_FAILED");
        documents += result.documents ?? 0;
        chunks += result.chunks ?? 0;
      }
      notify(`已导入 ${documents} 个文件、${chunks} 个知识片段`);
    } catch { notify(status.configured ? "知识库导入失败，请检查 Markdown 文件" : "请先配置后端与 API 密钥"); }
    finally { setImporting(false); }
  }

  async function toggleRecording() {
    if (recording) { recorderRef.current?.stop(); setRecording(false); await send("[ 语音 ]", "audio"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.onstop = () => stream.getTracks().forEach((track) => track.stop());
      recorder.start(); recorderRef.current = recorder; setRecording(true);
    } catch { notify("需要麦克风权限才能录音"); }
  }

  async function requestPush() {
    if (!("Notification" in window)) return notify("当前浏览器不支持通知");
    const result = await Notification.requestPermission();
    if (result !== "granted") { setPush(false); notify("未获得通知权限"); return; }
    if (!status.webPush?.configured || !status.webPush.publicKey || !("PushManager" in window)) return notify("通知后端尚未配置");
    try {
      const bytes = Uint8Array.from(atob(status.webPush.publicKey.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((status.webPush.publicKey.length + 3) % 4)), (character) => character.charCodeAt(0));
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("SUBSCRIBE_FAILED");
      setPush(true); notify("通知权限已开启");
    } catch { setPush(false); notify("通知订阅失败，请稍后重试"); }
  }

  async function toggleProactive() {
    const enabled = !proactive;
    const response = await fetch("/api/proactive/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai" }) });
    if (!response.ok) return notify("主动联系设置保存失败");
    setProactive(enabled); notify(enabled ? "Jeffrey 会在合适的时候联系你" : "已关闭主动联系");
  }

  async function installApp() {
    if (installEvent) { await installEvent.prompt(); const choice = await installEvent.userChoice; notify(choice.outcome === "accepted" ? "正在安装回声" : "已取消安装"); setInstallEvent(null); }
    else notify("请在浏览器菜单中选择「添加到主屏幕」");
  }

  return <main className="app-shell single-chat">
    {toast && <div className="toast" role="status">{toast}</div>}
    <aside className="rail" aria-label="主导航">
      <button className="brand" onClick={() => setView("chat")} aria-label="回声首页">回</button>
      <nav><button className={`rail-button ${view === "chat" ? "active" : ""}`} onClick={() => setView("chat")}><span className="nav-icon">◌</span><span>聊天</span></button></nav>
      <button className={`rail-button rail-bottom ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}><span className="nav-icon">⌁</span><span>设置</span></button>
    </aside>

    {view === "chat" && <section className="conversation full">
      <header className="conversation-header"><div className="person"><Image className="avatar avatar-image" src="/jeffrey-avatar.jpg" width={86} height={86} alt="Jeffrey 的狐狸头像" priority /><div><strong>Jeffrey</strong><small><i className={status.configured ? "" : "offline"} /> {status.mode === "preview" ? "DeepSeek 预览" : status.mode === "local" ? "本地 Codex" : status.configured ? "在线" : "等待后端配置"}</small></div></div><div className="header-actions"><button onClick={() => void loadChat()} aria-label="刷新消息">↻</button><button onClick={() => setView("settings")} aria-label="打开设置">•••</button></div></header>
      <div className="messages" ref={messagesRef}>
        <div className="day"><span>Jeffrey</span></div>
        {loading && <p className="empty">正在读取对话…</p>}
        {!loading && !status.configured && <div className="config-banner"><strong>Jeffrey 已经准备好了</strong><p>{status.error ?? "还需要连接私人后端和客户的 Mac。"}</p><button onClick={() => setView("settings")}>查看设置</button></div>}
        {!loading && status.configured && messages.length === 0 && <div className="bubble incoming"><p>嗨，我是 Jeffrey。把旧知识库导入后，我会逐渐找回原来的角色和记忆。</p><time>现在</time></div>}
        {messages.map((item) => <div className={`bubble ${item.sender === "user" ? "outgoing" : "incoming"}`} key={item.id}><p>{item.content}</p><time>{new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div>)}
        {developmentTask && <DevelopmentTaskCard key={developmentTask.id} initialTask={developmentTask} onChange={setDevelopmentTask} />}
        {localComputerTask && <LocalComputerTaskCard key={localComputerTask.id} initialTask={localComputerTask} approvalToken={localApprovalToken} onChange={setLocalComputerTask} />}
        {sending && <div className="bubble incoming typing"><p>Jeffrey 正在输入…</p></div>}
      </div>
      <footer className="composer-wrap">
        {attachmentOpen && <div className="attachment-menu"><button onClick={() => fileRef.current?.click()}><span>▧</span>图片</button><button className={recording ? "recording" : ""} onClick={() => void toggleRecording()}><span>◉</span>{recording ? "停止录音" : "语音"}</button></div>}
        <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleFile} />
        <div className="composer"><button aria-label="添加附件" className={attachmentOpen ? "pressed" : ""} onClick={() => setAttachmentOpen((open) => !open)}>＋</button><textarea aria-label="消息" placeholder={status.configured ? "输入消息…" : "请先配置后端"} value={message} disabled={!status.configured || sending} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button aria-label="添加表情" onClick={() => setMessage((text) => `${text}☺`)}>☺</button><button className="send" aria-label="发送" disabled={sending || !status.configured} onClick={() => void send()}>↑</button></div>
        <p>{recording ? "正在录音，点击语音按钮结束" : "按 Enter 发送 · Shift + Enter 换行"}</p>
      </footer>
    </section>}

    {view === "settings" && <section className="wide-panel settings-panel"><header className="page-header"><div><p className="eyebrow">私人空间</p><h1>设置</h1><p>管理 Jeffrey 的知识、记忆与设备权限。</p></div></header><div className="settings-grid">
      <section className="profile-card"><Image className="avatar profile avatar-image" src="/jeffrey-avatar.jpg" width={108} height={108} alt="Jeffrey" /><div><strong>Jeffrey</strong><small>{status.mode === "preview" ? "DeepSeek 预览模式" : status.configured ? "后端已连接" : "后端等待配置"}</small></div><button onClick={() => setView("chat")}>聊天</button></section>
      <section className="setting-group"><h2>智能与知识</h2><div className="setting-row"><div><strong>对话记忆</strong><small>{status.mode === "preview" ? "预览阶段暂存在当前浏览器" : status.mode === "local" ? "由客户 Mac 本地检索与整理" : "从重要对话中提取可检索的长期记忆"}</small></div><button className={`switch ${memory ? "on" : ""}`} onClick={() => setMemory(!memory)} aria-pressed={memory}><span /></button></div><div className="setting-row"><div><strong>Jeffrey 主动联系</strong><small>结合近期对话与本地记忆，在非静默时段自然联系；连续未回复时自动停止</small></div><button className={`switch ${proactive ? "on" : ""}`} onClick={() => void toggleProactive()} aria-pressed={proactive}><span /></button></div><div className="setting-row"><div><strong>迁移旧知识库</strong><small>{status.mode === "local" ? "Obsidian 保留在客户 Mac，不上传完整文件" : status.mode === "preview" ? "准备完成，连接正式数据库后即可导入" : "选择已整理的 Obsidian 文件夹；系统会保留目录并自动分批导入"}</small></div><button className="text-button" disabled={importing || status.mode === "preview" || status.mode === "local"} onClick={() => knowledgeRef.current?.click()}>{status.mode === "local" ? "在 Mac 设置" : importing ? "导入中…" : "选择文件夹"}</button><input ref={knowledgeRef} type="file" hidden multiple onChange={importKnowledge} {...{ webkitdirectory: "", directory: "" }} /></div></section>
      <section className="setting-group"><h2>设备权限</h2><div className="setting-row"><div><strong>消息通知</strong><small>{push ? "通知权限已允许" : "允许新消息提醒"}</small></div><button className={`switch ${push ? "on" : ""}`} onClick={() => void requestPush()} aria-pressed={push}><span /></button></div><div className="setting-row"><div><strong>安装到设备</strong><small>以独立窗口运行私人 PWA</small></div><button className="text-button" onClick={() => void installApp()}>安装</button></div></section>
      <LocalDeviceSettings enabled={status.localComputer?.enabled ?? false} configured={status.localComputer?.configured ?? false} mode={status.mode} initialStatus={status.localComputer?.deviceStatus} />
    </div><p className="version">回声 PWA · Jeffrey 私人版本 0.2</p></section>}
  </main>;
}
