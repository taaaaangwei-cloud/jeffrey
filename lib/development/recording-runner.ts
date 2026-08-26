import type { DevelopmentRunner, DevelopmentRunnerReference } from "./runner.ts";
import type { DevelopmentTask } from "./types.ts";

export interface RecordingRunnerCall {
  operation: "start" | "continue";
  taskId: string;
  instructions?: string;
}

export function createRecordingDevelopmentRunner(reference: DevelopmentRunnerReference = { runId: "recorded-run", runUrl: null }) {
  const calls: RecordingRunnerCall[] = [];
  const runner: DevelopmentRunner & { calls: RecordingRunnerCall[] } = {
    calls,
    async start(task: DevelopmentTask) {
      calls.push({ operation: "start", taskId: task.id });
      return reference;
    },
    async continue(task: DevelopmentTask, instructions: string) {
      calls.push({ operation: "continue", taskId: task.id, instructions });
      return reference;
    },
  };
  return runner;
}
