"use client";

import { useEffect, useState } from "react";
import { getDevelopmentTaskPresentation } from "../../lib/development/public-view.ts";
import type { PublicDevelopmentTask } from "../../lib/development/types.ts";

export function DevelopmentTaskCard(props: { initialTask: PublicDevelopmentTask; onChange?: (task: PublicDevelopmentTask) => void }) {
  const { initialTask, onChange } = props;
  const [task, setTask] = useState(initialTask);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const presentation = getDevelopmentTaskPresentation(task);

  useEffect(() => {
    if (!presentation.shouldPoll) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/development/tasks/${task.id}`, { cache: "no-store" });
        const result = await response.json() as { developmentTask?: PublicDevelopmentTask };
        if (response.ok && result.developmentTask) { setTask(result.developmentTask); onChange?.(result.developmentTask); }
      } catch { /* a later poll can recover */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [task.id, presentation.shouldPoll, onChange]);

  async function action(name: "cancel" | "approve") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/development/tasks/${task.id}/${name}`, {
        method: "POST",
        headers: name === "approve" ? { "content-type": "application/json" } : undefined,
        body: name === "approve" ? JSON.stringify({ approvalToken: task.approvalToken }) : undefined,
      });
      const result = await response.json() as { developmentTask?: PublicDevelopmentTask; error?: string };
      if (!response.ok || !result.developmentTask) throw new Error(result.error ?? "ACTION_FAILED");
      setTask(result.developmentTask); onChange?.(result.developmentTask);
    } catch { setError("这项操作暂时没有完成，请稍后再试。"); }
    finally { setBusy(false); }
  }

  return <aside className="development-card" aria-label="App 修改任务">
    <div className="development-card-heading"><span aria-hidden="true">◇</span><div><small>APP 修改任务</small><strong>{task.requestSummary}</strong></div></div>
    <p className="development-status"><i />{presentation.label}</p>
    <p>{presentation.detail}</p>
    <div className="development-checks" aria-label="自动检查">
      {Object.entries(task.checks).map(([name, value]) => <span key={name} data-status={value}>{name} · {value === "passed" ? "通过" : value === "failed" ? "未通过" : "等待"}</span>)}
    </div>
    {task.changeSummary && <p className="development-summary">{task.changeSummary}</p>}
    {error && <p className="development-error" role="alert">{error}</p>}
    <div className="development-actions">
      {task.previewUrl && <a href={task.previewUrl} target="_blank" rel="noopener noreferrer">查看预览</a>}
      {presentation.canApprove && <button disabled={busy} onClick={() => void action("approve")}>确认发布</button>}
      {presentation.canCancel && <button className="secondary" disabled={busy} onClick={() => void action("cancel")}>取消任务</button>}
    </div>
    {presentation.canContinue && <small className="development-hint">想继续调整，直接在下面告诉 Jeffrey 就可以。</small>}
  </aside>;
}
