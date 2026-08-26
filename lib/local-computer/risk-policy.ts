import type { LocalComputerRiskLevel } from "./types.ts";

export const localActionKinds = [
  "read_file",
  "search_files",
  "open_application",
  "inspect_webpage",
  "modify_file",
  "move_file",
  "run_command",
  "fill_form",
  "delete_file",
  "send_message",
  "upload_private_data",
  "install_software",
  "submit_form",
  "purchase",
  "password_manager",
  "recovery_key",
  "erase_disk",
  "disable_security",
  "hidden_remote_access",
] as const;

export type LocalActionKind = (typeof localActionKinds)[number];

const riskByAction: Record<LocalActionKind, LocalComputerRiskLevel> = {
  read_file: "low",
  search_files: "low",
  open_application: "low",
  inspect_webpage: "low",
  modify_file: "medium",
  move_file: "medium",
  run_command: "medium",
  fill_form: "medium",
  delete_file: "high",
  send_message: "high",
  upload_private_data: "high",
  install_software: "high",
  submit_form: "high",
  purchase: "high",
  password_manager: "blocked",
  recovery_key: "blocked",
  erase_disk: "blocked",
  disable_security: "blocked",
  hidden_remote_access: "blocked",
};

export interface LocalComputerApprovalPolicy {
  dispatchAllowed: boolean;
  taskApproval: boolean;
  actionApproval: boolean;
}

export function classifyLocalAction(action: LocalActionKind): LocalComputerRiskLevel {
  return riskByAction[action];
}

export function getLocalComputerApprovalPolicy(riskLevel: LocalComputerRiskLevel): LocalComputerApprovalPolicy {
  switch (riskLevel) {
    case "low": return { dispatchAllowed: true, taskApproval: false, actionApproval: false };
    case "medium": return { dispatchAllowed: true, taskApproval: true, actionApproval: false };
    case "high": return { dispatchAllowed: true, taskApproval: true, actionApproval: true };
    case "blocked": return { dispatchAllowed: false, taskApproval: false, actionApproval: false };
  }
}
