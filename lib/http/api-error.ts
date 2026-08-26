import { ZodError } from "zod";
import { ServerConfigurationError } from "../config/server.ts";
import { PrivateApiError } from "./private-user.ts";

export function apiErrorResponse(error: unknown, operation: string): Response {
  if (error instanceof ZodError) {
    return Response.json({ success: false, error: "Invalid request", issues: error.issues }, { status: 400 });
  }
  if (error instanceof PrivateApiError) {
    return Response.json({ success: false, error: error.code }, { status: error.status });
  }
  if (error instanceof ServerConfigurationError) {
    return Response.json({ success: false, error: error.publicMessage }, { status: 503 });
  }
  if (error instanceof Error && error.message === "CHAT_RESOURCE_NOT_FOUND") {
    return Response.json({ success: false, error: "Chat not found" }, { status: 404 });
  }
  if (error instanceof Error && error.message === "DEVELOPMENT_TASK_NOT_FOUND") {
    return Response.json({ success: false, error: "Development task not found" }, { status: 404 });
  }
  if (error instanceof Error && (error.message.startsWith("INVALID_DEVELOPMENT_TRANSITION") || error.message === "INVALID_RELEASE_APPROVAL" || error.message === "ACTIVE_DEVELOPMENT_TASK_EXISTS")) {
    return Response.json({ success: false, error: "Development task is not in a valid state for this action" }, { status: 409 });
  }
  if (error instanceof Error && error.message === "LOCAL_AGENT_UNAUTHORIZED") {
    return Response.json({ success: false, error: "Unauthorized local agent" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "LOCAL_COMPUTER_AGENT_DISABLED") {
    return Response.json({ success: false, error: "Local computer control is not configured" }, { status: 503 });
  }
  if (error instanceof Error && ["LOCAL_COMPUTER_TASK_NOT_FOUND", "LOCAL_DEVICE_NOT_FOUND"].includes(error.message)) {
    return Response.json({ success: false, error: "Local resource not found" }, { status: 404 });
  }
  if (error instanceof Error && error.message === "LOCAL_ACTION_BLOCKED") {
    return Response.json({ success: false, error: "This local action is blocked" }, { status: 403 });
  }
  if (error instanceof Error && (error.message.startsWith("INVALID_LOCAL_") || error.message.startsWith("LOCAL_APPROVAL_") || error.message.startsWith("LOCAL_PAIRING_") || ["ACTIVE_LOCAL_COMPUTER_TASK_EXISTS", "LOCAL_DEVICE_OFFLINE", "LOCAL_CANCEL_NOT_ALLOWED"].includes(error.message))) {
    return Response.json({ success: false, error: "Local computer request is not in a valid state" }, { status: 409 });
  }
  console.error(`${operation}_ERROR`, { name: error instanceof Error ? error.name : "unknown" });
  const publicMessage = operation === "CHAT"
    ? "Chat request failed"
    : `${operation.toLowerCase().replaceAll("_", " ")} failed`;
  return Response.json({ success: false, error: publicMessage }, { status: 500 });
}
