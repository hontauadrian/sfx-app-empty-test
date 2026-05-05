#!/usr/bin/env node

/**
 * PreToolUse hook: Blocks silent .catch(() => { }) patterns.
 *
 * Rule: Never swallow errors silently. Transient errors must show a toast
 * via addToast(). Empty catch blocks hide failures from users.
 */

const fs = require("fs");

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const toolName = input.tool_name;

if (toolName !== "Edit" && toolName !== "Write") {
  console.log(JSON.stringify({ decision: "approve" }));
  process.exit(0);
}

const content = toolName === "Write"
  ? input.tool_input?.content ?? ""
  : input.tool_input?.new_string ?? "";

const filePath = input.tool_input?.file_path ?? "";

// Only check feature source files, not tests or node_modules
if (!filePath.includes("/src/features/") || filePath.includes("__tests__")) {
  console.log(JSON.stringify({ decision: "approve" }));
  process.exit(0);
}

// Detect silent catch patterns:
// .catch(() => { })  .catch(() => { /* comment */ })  .catch(() => {\n})
const silentCatchPattern = /\.catch\(\s*\(\s*\)\s*=>\s*\{[\s/\*a-zA-Z\-—]*\}\s*\)/g;
const matches = content.match(silentCatchPattern);

if (matches && matches.length > 0) {
  const violationCount = matches.length;
  const message = [
    "BLOCKED: Silent .catch(() => {}) detected.",
    "",
    "Error Handling Rule: Never swallow errors silently.",
    "  - Transient errors (network, timeout) -> addToast(error.message)",
    "  - Persistent errors (validation) -> add to UIModel",
    "  - Unrecoverable errors -> let bubble to error boundary",
    "",
    "Fix: Replace empty catch with:",
    "  .catch((error: Error) => { addToast(error.message); })",
    "",
    "Found " + violationCount + " violations.",
  ].join("\n");

  console.log(JSON.stringify({ decision: "block", reason: message }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: "approve" }));
