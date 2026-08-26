import assert from "node:assert/strict";
import test from "node:test";
import { classifyLocalAction, getLocalComputerApprovalPolicy } from "../lib/local-computer/risk-policy.ts";

test("read-only local actions can run from the customer's current instruction", () => {
  for (const action of ["read_file", "search_files", "open_application", "inspect_webpage"] as const) {
    assert.equal(classifyLocalAction(action), "low");
  }
  assert.deepEqual(getLocalComputerApprovalPolicy("low"), { dispatchAllowed: true, taskApproval: false, actionApproval: false });
});

test("local writes require one task approval", () => {
  for (const action of ["modify_file", "move_file", "run_command", "fill_form"] as const) {
    assert.equal(classifyLocalAction(action), "medium");
  }
  assert.deepEqual(getLocalComputerApprovalPolicy("medium"), { dispatchAllowed: true, taskApproval: true, actionApproval: false });
});

test("irreversible or external local actions require exact action approval", () => {
  for (const action of ["delete_file", "send_message", "upload_private_data", "install_software", "submit_form", "purchase"] as const) {
    assert.equal(classifyLocalAction(action), "high");
  }
  assert.deepEqual(getLocalComputerApprovalPolicy("high"), { dispatchAllowed: true, taskApproval: true, actionApproval: true });
});

test("credential and system takeover actions are never dispatched", () => {
  for (const action of ["password_manager", "recovery_key", "erase_disk", "disable_security", "hidden_remote_access"] as const) {
    assert.equal(classifyLocalAction(action), "blocked");
  }
  assert.deepEqual(getLocalComputerApprovalPolicy("blocked"), { dispatchAllowed: false, taskApproval: false, actionApproval: false });
});
