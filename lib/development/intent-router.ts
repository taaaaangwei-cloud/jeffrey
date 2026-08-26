import type { DevelopmentIntentModel, RoutedDevelopmentIntent } from "./intent-model.ts";

export function createDevelopmentIntentRouter(model: DevelopmentIntentModel) {
  return {
    async route(message: string): Promise<RoutedDevelopmentIntent> {
      try {
        const intent = await model.classify(message);
        if (intent.kind === "app_change" && intent.riskLevel === "sensitive") {
          return {
            kind: "sensitive_confirmation",
            summary: intent.summary,
            question: "这项修改可能影响数据或安全。请明确确认修改范围后，我才会创建任务。",
          };
        }
        return intent;
      } catch {
        return { kind: "chat" };
      }
    },
  };
}
