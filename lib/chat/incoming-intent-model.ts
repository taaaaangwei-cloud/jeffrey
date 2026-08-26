import type { LocalComputerCapability, LocalComputerRiskLevel } from "../local-computer/types.ts";
import type { DevelopmentRiskLevel } from "../development/types.ts";

export type IncomingIntent =
  | { kind: "chat" }
  | { kind: "ambiguous"; question: string }
  | { kind: "app_change"; summary: string; requestedChanges: string[]; riskLevel: DevelopmentRiskLevel }
  | {
      kind: "local_computer";
      summary: string;
      requestedOutcome: string;
      riskLevel: LocalComputerRiskLevel;
      capabilities: LocalComputerCapability[];
    };

export interface IncomingIntentModel {
  classify(message: string): Promise<IncomingIntent>;
}
