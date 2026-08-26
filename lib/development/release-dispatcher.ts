import type { DevelopmentTask } from "./types.ts";

export interface DevelopmentReleaseDispatcher {
  dispatch(task: DevelopmentTask): Promise<void>;
}

export function createGitHubReleaseDispatcher(dependencies: {
  repository: string;
  installationToken(): Promise<string>;
  fetch?: typeof globalThis.fetch;
}): DevelopmentReleaseDispatcher {
  const request = dependencies.fetch ?? globalThis.fetch;
  return {
    async dispatch(task) {
      const token = await dependencies.installationToken();
      const response = await request(`https://api.github.com/repos/${dependencies.repository}/dispatches`, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
          "content-type": "application/json", "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ event_type: "jeffrey_release_task", client_payload: { task_id: task.id, event_id: crypto.randomUUID() } }),
      });
      if (!response.ok) throw new Error("GITHUB_RELEASE_DISPATCH_FAILED");
    },
  };
}
