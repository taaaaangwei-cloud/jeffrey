import type { DevelopmentRunner } from "./runner.ts";
import type { DevelopmentTask } from "./types.ts";

export function createGitHubActionsDevelopmentRunner(dependencies: {
  repository: string;
  installationToken(): Promise<string>;
  fetch?: typeof globalThis.fetch;
}): DevelopmentRunner {
  const request = dependencies.fetch ?? globalThis.fetch;

  async function dispatch(task: DevelopmentTask, operation: "start" | "continue") {
    const eventId = crypto.randomUUID();
    const token = await dependencies.installationToken();
    const response = await request(`https://api.github.com/repos/${dependencies.repository}/dispatches`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "jeffrey_development_task",
        client_payload: { task_id: task.id, operation, event_id: eventId },
      }),
    });
    if (!response.ok) throw new Error("GITHUB_DISPATCH_FAILED");
    return { runId: eventId, runUrl: `https://github.com/${dependencies.repository}/actions` };
  }

  return {
    start(task) { return dispatch(task, "start"); },
    continue(task) { return dispatch(task, "continue"); },
  };
}
