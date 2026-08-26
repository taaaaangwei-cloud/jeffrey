"use client";

import { useEffect, useState } from "react";
import { getLocalComputerTaskPresentation } from "../../lib/local-computer/presentation";
import type { PublicLocalComputerTask } from "../../lib/local-computer/types";

export function LocalComputerTaskCard({ initialTask, approvalToken, onChange }: {
  initialTask: PublicLocalComputerTask;
  approvalToken?: string;
  onChange(task: PublicLocalComputerTask | null): void;
}) {
  const [task, setTask] = useState(initialTask);
  const [token, setToken] = useState(approvalToken);
  const [busy, setBusy] = useState(false);
  const presentation = getLocalComputerTaskPresentation(task.status);

  useEffect(() => {
    if (["completed", "canceled", "expired", "failed"].includes(task.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/local-computer/tasks/${task.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { task?: PublicLocalComputerTask; approvalToken?: string };
      if (result.task) { setTask(result.task); setToken(result.approvalToken); onChange(result.task); }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [task.id, task.status, onChange]);

  async function act(action: "approve" | "approve-action" | "reject" | "cancel") {
    setBusy(true);
    try {
      const response = await fetch(`/api/local-computer/tasks/${task.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalToken: token }),
      });
      const result = await response.json() as { task?: PublicLocalComputerTask };
      if (response.ok && result.task) { setTask(result.task); onChange(result.task); }
    } finally { setBusy(false); }
  }

  return <section className={`local-task-card ${presentation.tone}`} aria-label="本地电脑任务">
    <div className="local-task-heading"><span className="mac-glyph">⌘</span><div><small>客户的 Mac · 本地 Codex</small><strong>{task.requestSummary}</strong></div></div>
    <div className="task-status"><i />{presentation.label}</div>
    {task.publicProgress && <p>{task.publicProgress}</p>}
    {task.pendingActionSummary && <div className="action-warning"><strong>准备执行</strong><p>{task.pendingActionSummary}</p><small>只确认这一个具体操作；其他高风险操作会再次询问。</small></div>}
    {task.resultSummary && <p className="task-result">{task.resultSummary}</p>}
    <div className="task-actions">
      {presentation.actions.includes("approve") && <button disabled={busy || !token} onClick={() => void act("approve")}>确认发送</button>}
      {presentation.actions.includes("approve_action") && <button disabled={busy || !token} onClick={() => void act("approve-action")}>确认此操作</button>}
      {presentation.actions.includes("reject") && <button className="secondary" disabled={busy} onClick={() => void act("reject")}>拒绝</button>}
      {presentation.actions.includes("cancel") && <button className="secondary" disabled={busy} onClick={() => void act("cancel")}>停止任务</button>}
    </div>
  </section>;
}
