import type { DevelopmentTask } from "./types.ts";

export interface DevelopmentRunnerReference {
  runId: string;
  runUrl: string | null;
}

export interface DevelopmentRunner {
  start(task: DevelopmentTask): Promise<DevelopmentRunnerReference>;
  continue(task: DevelopmentTask, instructions: string): Promise<DevelopmentRunnerReference>;
}
