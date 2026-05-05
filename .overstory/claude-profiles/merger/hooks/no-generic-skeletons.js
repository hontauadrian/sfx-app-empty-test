#!/usr/bin/env node

/**
 * PreToolUse hook: Blocks generic skeleton/spinner/loading patterns in page files.
 *
 * Rule: Loading states must use layout-faithful skeleton screens that mimic
 * the live UI structure. Never use generic SkeletonCard, spinners, or
 * "Loading..." text. Each page's skeleton must reproduce the same element
 * hierarchy, spacing, and dimensions as the real content.
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

// Only check page component files (not shared components, not tests)
const isPageFile = filePath.includes("/pages/") && filePath.endsWith("-page.tsx");
if (!isPageFile) {
  console.log(JSON.stringify({ decision: "approve" }));
  process.exit(0);
}

const violations = [];

// Check for generic SkeletonCard imports/usage
if (/SkeletonCard/.test(content)) {
  violations.push("Generic <SkeletonCard /> found. Build a layout-faithful skeleton instead.");
}

// Check for spinner patterns
if (/spinner|Spinner|<Loader|<Loading/.test(content)) {
  violations.push("Generic spinner/loader component found. Use layout-faithful skeleton.");
}

// Check for "Loading..." text
if (/"Loading\.\.\."/.test(content) || />Loading\.\.\.</.test(content)) {
  violations.push('"Loading..." text found. Use layout-faithful skeleton with animate-pulse blocks.');
}

if (violations.length > 0) {
  const message = [
    "BLOCKED: Generic loading patterns in page file.",
    "",
    "Rule: Loading states must use skeleton screens that mimic the live UI layout.",
    "Each skeleton must match the real page structure, spacing, and dimensions.",
    "",
    "Instead of <SkeletonCard />, build the skeleton inline with animate-pulse",
    "blocks matching the exact layout of the loaded state.",
    "",
    "Violations:",
    ...violations.map((violation) => "  - " + violation),
  ].join("\n");

  console.log(JSON.stringify({ decision: "block", reason: message }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: "approve" }));
