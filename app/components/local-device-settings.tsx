"use client";

import { useState } from "react";

type DeviceStatus = "unpaired" | "offline" | "online" | "paused" | "incompatible";
const labels: Record<DeviceStatus, string> = { unpaired: "尚未配对", offline: "已配对 · 当前离线", online: "已配对 · 在线", paused: "已暂停", incompatible: "需要更新 Jeffrey Local" };

export function LocalDeviceSettings({ enabled, configured, mode, initialStatus = "unpaired" }: {
  enabled: boolean; configured: boolean; mode: "full" | "local" | "preview" | undefined; initialStatus?: DeviceStatus;
}) {
  const [code, setCode] = useState("");
  const [deviceStatus, setDeviceStatus] = useState(initialStatus);
  const [feedback, setFeedback] = useState("");
  const available = (mode === "full" || mode === "local") && enabled && configured;

  async function pair() {
    if (!/^[A-Z0-9]{6}$/u.test(code.trim().toUpperCase())) return setFeedback("请输入 Mac 上显示的 6 位配对码");
    const response = await fetch("/api/local-devices/pairing/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code.trim().toUpperCase() }) });
    if (!response.ok) return setFeedback("配对码无效或已过期，请在 Mac 上重新生成");
    setCode(""); setDeviceStatus("offline"); setFeedback("配对成功，正在等待 Mac 上线");
  }

  async function revoke() {
    if (!window.confirm("解除配对会立即停止所有本地任务。确定继续吗？")) return;
    const response = await fetch("/api/local-devices/current/revoke", { method: "POST" });
    if (response.ok) { setDeviceStatus("unpaired"); setFeedback("已解除配对并停止本地任务"); }
  }

  return <section className="setting-group mac-settings">
    <h2>我的 Mac</h2>
    {!available ? <div className="setting-row"><div><strong>本地 Codex 控制</strong><small>{mode === "preview" ? "DeepSeek 预览不连接电脑；正式交付时改用客户 Mac" : "完成安全配置与 Jeffrey Local 安装后启用"}</small></div><span className="status-pill muted">未启用</span></div> : <>
      <div className="setting-row"><div><strong>Jeffrey Local</strong><small>{labels[deviceStatus]}</small></div><span className={`status-pill ${deviceStatus}`}>{deviceStatus === "online" ? "在线" : deviceStatus === "unpaired" ? "未配对" : "离线"}</span></div>
      {deviceStatus === "unpaired" ? <div className="pairing-panel"><p>在客户 Mac 打开 Jeffrey Local，输入它显示的一次性配对码。</p><div><input value={code} maxLength={6} autoCapitalize="characters" placeholder="6 位配对码" aria-label="Mac 配对码" onChange={(event) => setCode(event.target.value.toUpperCase())} /><button onClick={() => void pair()}>配对</button></div></div> : <div className="setting-row"><div><strong>紧急停止与解除配对</strong><small>立即撤销设备会话，并取消所有未完成的电脑任务</small></div><button className="danger-button" onClick={() => void revoke()}>解除配对</button></div>}
      {feedback && <p className="setting-feedback" role="status">{feedback}</p>}
      <div className="risk-legend"><span><b>低</b>读取与查找</span><span><b>中</b>修改前确认</span><span><b>高</b>任务与具体动作分别确认</span></div>
    </>}
  </section>;
}
