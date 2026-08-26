import type { DevelopmentRiskLevel } from "./types.ts";

export type DevelopmentIntent =
  | { kind: "chat" }
  | { kind: "ambiguous"; question: string }
  | {
      kind: "app_change";
      summary: string;
      requestedChanges: string[];
      riskLevel: DevelopmentRiskLevel;
    };

export interface DevelopmentIntentModel {
  classify(message: string): Promise<DevelopmentIntent>;
}

export type RoutedDevelopmentIntent =
  | DevelopmentIntent
  | { kind: "sensitive_confirmation"; summary: string; question: string };
