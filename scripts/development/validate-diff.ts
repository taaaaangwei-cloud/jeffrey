import { execFileSync } from "node:child_process";
import { assertSafeDevelopmentDiff } from "../../lib/development/diff-policy.ts";

const output = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
const files = output.split("\n").map((line) => line.slice(3).trim()).filter(Boolean);
assertSafeDevelopmentDiff(files);
process.stdout.write(`Validated ${files.length} changed files\n`);
