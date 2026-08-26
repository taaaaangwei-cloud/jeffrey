import { createHmac } from "node:crypto";

const [status, publicMessage] = process.argv.slice(2);
const taskId = process.env.JEFFREY_TASK_ID;
const backend = process.env.JEFFREY_BACKEND_URL;
const secret = process.env.DEVELOPMENT_CALLBACK_SECRET;
const eventId = `${process.env.GITHUB_RUN_ID ?? "local"}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}-${status}`;
if (!taskId || !backend || !secret || !status || !publicMessage) throw new Error("CALLBACK_CONFIGURATION_MISSING");

const body = JSON.stringify({
  taskId,
  status,
  publicMessage,
  ...(process.env.PREVIEW_SHA ? { previewSha: process.env.PREVIEW_SHA } : {}),
  ...(process.env.PUBLISHED_SHA ? { publishedSha: process.env.PUBLISHED_SHA } : {}),
  ...(process.env.PREVIOUS_PRODUCTION_SHA ? { previousProductionSha: process.env.PREVIOUS_PRODUCTION_SHA } : {}),
  ...(process.env.PREVIEW_URL ? { previewUrl: process.env.PREVIEW_URL } : {}),
  ...(process.env.RUNNER_URL ? { runnerUrl: process.env.RUNNER_URL } : {}),
  ...(process.env.CHANGE_SUMMARY ? { changeSummary: process.env.CHANGE_SUMMARY.slice(0, 2000) } : {}),
  ...(process.env.CHECKS_JSON ? { checks: JSON.parse(process.env.CHECKS_JSON) } : {}),
  ...(process.env.ERROR_CODE ? { errorCode: process.env.ERROR_CODE } : {}),
});
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${eventId}.${body}`).digest("hex")}`;
const response = await fetch(`${backend.replace(/\/$/u, "")}/api/development/callbacks/github`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-jeffrey-timestamp": timestamp,
    "x-jeffrey-event-id": eventId,
    "x-jeffrey-signature": signature,
  },
  body,
});
if (!response.ok) throw new Error(`CALLBACK_FAILED:${response.status}`);
