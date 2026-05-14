/**
 * PreToolUse hook — blocks close-intent commands until qa-test has been run
 * against the live stack for the CURRENT code state, and the resulting
 * report shows zero CRITICAL / HIGH issues and zero FAIL criteria.
 *
 * Triggers same as pre-close-gate.js:
 *   - `sd close`
 *   - `ov mail send --type worker_done`
 *   - `ov merge` (without --dry-run)
 *
 * Only applies to builder/lead/scout/reviewer/merger agents that have touched
 * UI files in their session (apps/web/src/** or apps/web/src/app/**).
 *
 * State-hash caching: report is keyed to the current git diff + .stack.json
 * + spec mtime. Same code state → reuse report. Code changes → new hash →
 * forces a fresh qa-test run. No infinite loop because qa-test runs once
 * per meaningful state, not per Stop tick.
 *
 * On missing or dirty report → emits deny with `/qa-test ...` instructions.
 * On clean report → exits 0 (allow).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (input.tool_name !== 'Bash') process.exit(0);

const command = input.tool_input?.command || '';
const CLOSE_PATTERN = /\bsd\s+close\b/;
const WORKER_DONE_PATTERN = /--type[= ]\s*worker_done\b/;
const OV_MERGE_PATTERN = /\bov\s+merge\b(?![\s\S]*--dry-run\b)/;

const intent =
  (CLOSE_PATTERN.test(command) && 'sd close') ||
  (WORKER_DONE_PATTERN.test(command) && 'worker_done mail') ||
  (OV_MERGE_PATTERN.test(command) && 'ov merge');

if (!intent) process.exit(0);

function resolveTargetWorktreePath(branchName) {
  try {
    const out = execSync('git worktree list --porcelain', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const blocks = out.split('\n\n');
    for (const block of blocks) {
      const lines = block.split('\n');
      const wtLine = lines.find((line) => line.startsWith('worktree '));
      const branchLine = lines.find((line) => line.startsWith('branch '));
      if (branchLine === `branch refs/heads/${branchName}` && wtLine) {
        return wtLine.slice('worktree '.length);
      }
    }
  } catch {
    return null;
  }
  return null;
}

let PROJECT_DIR;
if (intent === 'ov merge') {
  const branchMatch = command.match(/--branch[= ]\s*(\S+)/);
  if (!branchMatch) process.exit(0);
  const resolvedPath = resolveTargetWorktreePath(branchMatch[1]);
  if (!resolvedPath) process.exit(0);
  PROJECT_DIR = resolvedPath;
} else {
  PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || process.cwd();
}
const STACK_FILE = path.join(PROJECT_DIR, '.stack.json');
const HOOK_REPORTS_DIR = path.join(PROJECT_DIR, '.claude', 'hook-reports');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: PROJECT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

// 1. Did the session touch any UI files? If no — skip the gate entirely.
//    Compare current branch against its origin merge-base for the full diff.
const baseBranch = (sh('git symbolic-ref refs/remotes/origin/HEAD').trim().replace('refs/remotes/origin/', '')) || 'master';
const mergeBase = sh(`git merge-base HEAD origin/${baseBranch}`).trim();
const rawDiff = mergeBase ? sh(`git diff --name-only ${mergeBase} HEAD`) : sh('git diff --name-only HEAD');
const STATE_PATH_EXCLUSIONS = [
  /^\.claude\//,
  /^\.overstory\//,
  /^\.mulch\//,
  /^\.seeds\//,
  /^\.canopy\//,
  /^\.bridge\./,
  /^\._/,
  /^\.DS_Store$/,
];
const diff = rawDiff
  .split('\n')
  .filter((file) => !STATE_PATH_EXCLUSIONS.some((rgx) => rgx.test(file)))
  .join('\n');
const uiTouched = diff
  .split('\n')
  .some((file) => /^apps\/web\/src\/(app|features|stores|components)\//.test(file));

if (!uiTouched) process.exit(0);

// 2. Load stack info — we need a live URL to run qa-test against.
let stackInfo = null;
try {
  const raw = JSON.parse(fs.readFileSync(STACK_FILE, 'utf8'));
  stackInfo = {
    host: typeof raw.host === 'string' && raw.host ? raw.host : 'localhost',
    webPort: typeof raw.web_port === 'number' ? raw.web_port : null,
    apiPort: typeof raw.api_port === 'number' ? raw.api_port : null,
    composeProject: typeof raw.compose_project === 'string' ? raw.compose_project : null,
  };
} catch {
  // No stack info — defer to existing e2e gate / let stack-up errors surface elsewhere.
  process.exit(0);
}
if (!stackInfo.webPort) process.exit(0);

const webBaseUrl = `http://${stackInfo.host}:${stackInfo.webPort}`;

// 3. Resolve task-id from the worktree dir or git branch name.
const branch = sh('git rev-parse --abbrev-ref HEAD').trim();
const taskMatch =
  branch.match(/sfx-[a-z0-9-]+-[a-f0-9]{4}$/) ||
  PROJECT_DIR.match(/sfx-[a-z0-9-]+-[a-f0-9]{4}$/);
const taskId = (taskMatch && taskMatch[0]) || branch.replace(/[^a-zA-Z0-9-]/g, '_') || 'unknown-task';

// 4. Compute state hash so reports are keyed to current code + stack state.
const stackJsonText = (() => {
  try {
    return fs.readFileSync(STACK_FILE, 'utf8');
  } catch {
    return '';
  }
})();
const specPath = path.join(PROJECT_DIR, '.overstory', 'specs', `${taskId}.md`);
const specText = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
const stateHash = crypto
  .createHash('sha1')
  .update(diff + '\n----\n' + specText)
  .digest('hex')
  .slice(0, 12);

const reportPath = path.join(HOOK_REPORTS_DIR, `qa-test-${taskId}-${stateHash}.md`);

// 5. Report missing → deny with run instructions.
if (!fs.existsSync(reportPath)) {
  const message = [
    `QA gate blocked ${intent} for task ${taskId}.`,
    '',
    'No qa-test report found for the current code state. Run the qa-test skill against the live stack first:',
    '',
    `  /qa-test ${webBaseUrl} --full`,
    '',
    'Quinn will derive success criteria from the spec at .overstory/specs/' + taskId + '.md and the diff,',
    'then verify each criterion. Jinx will run adversarial break-it testing in parallel.',
    '',
    `Save the combined report to: ${path.relative(PROJECT_DIR, reportPath)}`,
    '',
    'Then retry the close. The gate re-checks on every attempt; the report is cached',
    `against the current state hash (${stateHash}) so reruns are only needed after`,
    'real code changes.',
    '',
    'Reference URLs (read from .stack.json — Playwright MCP must use these, NOT http://localhost):',
    `  WEB: ${webBaseUrl}`,
    stackInfo.apiPort ? `  API: http://${stackInfo.host}:${stackInfo.apiPort}` : null,
  ].filter(Boolean).join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  }));
  process.exit(0);
}

// 6. Report present → parse for severity counts.
const reportText = fs.readFileSync(reportPath, 'utf8');
const criticalCount = (reportText.match(/\[CRITICAL\]|\*\*Severity:\*\*\s*Critical|Priority:\s*P0[\s\S]*?Status:\s*FAIL/gi) || []).length;
const highCount = (reportText.match(/\[HIGH\]|\*\*Severity:\*\*\s*High|Priority:\s*P1[\s\S]*?Status:\s*FAIL/gi) || []).length;
const failCount = (reportText.match(/\bStatus:\s*FAIL\b|\|\s*FAIL\s*\|/gi) || []).length;

if (criticalCount + highCount + failCount > 0) {
  const summary = [
    `QA gate blocked ${intent} — qa-test report has unresolved issues:`,
    `  CRITICAL: ${criticalCount}`,
    `  HIGH:     ${highCount}`,
    `  FAIL:     ${failCount}`,
    '',
    `Report: ${path.relative(PROJECT_DIR, reportPath)}`,
    '',
    'Fix the issues, commit, then re-run:',
    `  /qa-test ${webBaseUrl} --full`,
    '',
    'New code → new state hash → fresh qa-test run required. The cached report',
    `for hash ${stateHash} is the one currently blocking; once code changes, the`,
    'gate will look for a new report at qa-test-<task>-<new-hash>.md.',
  ].join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: summary,
    },
  }));
  process.exit(0);
}

// 7. Clean report → allow.
process.exit(0);
