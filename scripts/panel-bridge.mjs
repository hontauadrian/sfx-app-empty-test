#!/usr/bin/env node
/**
 * Panel bridge for the SFX webapp boilerplate.
 *
 * Runs as a child of the panel. Talks NDJSON over stdio:
 *   - stdout: one JSON object per line. `bridge.ready`, `migration.applied`,
 *     `env_request.new`, `env_request.removed`, `rebuild.started`,
 *     `rebuild.completed`, `log`. See ../scripts/panel-bridge.README.md.
 *   - stdin: one JSON command per line. `env_request.resolve`,
 *     `env_request.dismiss`, `rebuild.trigger`.
 *
 * Self-contained: only uses Node stdlib so the boilerplate stays portable
 * (the panel container ships Node 22 - no extra install steps).
 *
 * The bridge reads its sibling `panel.config.json` for runtime parameters
 * (which schema files drive migrations, which env files to manage, which
 * lockfiles trigger a rebuild). Everything else - polling intervals, retry
 * behavior, output format - lives here.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { createInterface } from "node:readline";

// Poll intervals — see panel-bridge.README.md "Performance budget" for
// rationale. Tightened from 1500-2000ms to 500ms across all watchers so
// agent test loops observe migrations / env edits / lockfile bumps within
// the SLA documented there.
const MIGRATION_POLL_INTERVAL_MS = 500;
const ENV_REQUEST_POLL_INTERVAL_MS = 500;
const REBUILD_POLL_INTERVAL_MS = 500;
const ENV_FILE_POLL_INTERVAL_MS = 500;
const REBUILD_DEBOUNCE_MS = 500;
const ENV_FILE_DEBOUNCE_MS = 500;
const PNPM_INSTALL_TIMEOUT_MS = 300_000;
const COMPOSE_BUILD_TIMEOUT_MS = 600_000;
const REBUILD_COMMAND_TIMEOUT_MS = 600_000;
const ENV_RESTART_TIMEOUT_MS = 60_000;
const MIGRATION_APPLY_TIMEOUT_MS = 120_000;
const STDIO_TAIL_BYTES = 4_000;

// Worker-mode override (per-worktree spawn from `stack-up-docker.sh`):
//   PANEL_BRIDGE_WORKSPACE        — absolute path to the worker's worktree
//                                   (overrides PANEL_BRIDGE_WORKSPACE_ROOT and cwd).
//   PANEL_BRIDGE_COMPOSE_PROJECT  — compose project name for this worker
//                                   (overrides the manifest's composeProject).
// When the panel itself spawns the bridge, it sets PANEL_BRIDGE_WORKSPACE_ROOT
// + PANEL_BRIDGE_COMPOSE_PROJECT (no PANEL_BRIDGE_WORKSPACE) and the bridge
// runs against the connected workspace + manifest's compose project. Worker
// stacks set PANEL_BRIDGE_WORKSPACE so the bridge polls the worktree's
// schema/env/lockfile paths but applies changes against the worker's compose
// project (e.g. `app-w7`) instead of `app-dev-host`.
const workerWorkspace =
  process.env.PANEL_BRIDGE_WORKSPACE && process.env.PANEL_BRIDGE_WORKSPACE !== ""
    ? process.env.PANEL_BRIDGE_WORKSPACE
    : null;
const workspaceRoot =
  workerWorkspace ??
  (process.env.PANEL_BRIDGE_WORKSPACE_ROOT &&
  process.env.PANEL_BRIDGE_WORKSPACE_ROOT !== ""
    ? process.env.PANEL_BRIDGE_WORKSPACE_ROOT
    : process.cwd());
const composeProjectFromEnv =
  process.env.PANEL_BRIDGE_COMPOSE_PROJECT &&
  process.env.PANEL_BRIDGE_COMPOSE_PROJECT !== ""
    ? process.env.PANEL_BRIDGE_COMPOSE_PROJECT
    : null;

function emit(event) {
  // One JSON object per line, plus a trailing newline. The panel reads
  // line-by-line and never buffers a partial event.
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function emitLog(level, message) {
  emit({ type: "log", level, message });
}

function loadManifest() {
  const manifestPath = join(workspaceRoot, "panel.config.json");
  if (!existsSync(manifestPath)) {
    emitLog("warn", `panel.config.json not found at ${manifestPath}`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    emitLog(
      "error",
      `panel.config.json parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

function resolveAbsolute(relativePath) {
  if (isAbsolute(relativePath)) return relativePath;
  return join(workspaceRoot, relativePath);
}

function listChildDirsSafe(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function mtimeMsSafe(absolutePath) {
  try {
    return statSync(absolutePath).mtimeMs;
  } catch {
    return null;
  }
}

function sha256Safe(absolutePath) {
  // Returns a hex digest of the file's contents, or null when the path is
  // unreadable. Used by the rebuild + env-file watchers to dedupe `touch` /
  // formatter re-saves / lockfile no-op rewrites that bump mtime without
  // changing the actual bytes — the test loop budget cannot afford spurious
  // image rebuilds or compose restarts.
  try {
    const buffer = readFileSync(absolutePath);
    return createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}

function tailString(text, maxBytes) {
  if (text.length <= maxBytes) return text;
  return text.slice(text.length - maxBytes);
}

function spawnCapture(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
    });
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let killed = false;
    const timeoutMs = options.timeoutMs ?? 0;
    let timeoutHandle = null;
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        killed = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // Already gone.
        }
      }, timeoutMs);
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      if (stdoutBuffer.length > STDIO_TAIL_BYTES * 4) {
        stdoutBuffer = stdoutBuffer.slice(-STDIO_TAIL_BYTES * 4);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk;
      if (stderrBuffer.length > STDIO_TAIL_BYTES * 4) {
        stderrBuffer = stderrBuffer.slice(-STDIO_TAIL_BYTES * 4);
      }
    });
    child.once("error", (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        success: false,
        stdout: stdoutBuffer,
        stderr: `${stderrBuffer}\n${error instanceof Error ? error.message : String(error)}`,
        exitCode: null,
        timedOut: killed,
      });
    });
    child.once("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        success: !killed && code === 0,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        exitCode: code,
        timedOut: killed,
      });
    });
  });
}

// -------- Migrations --------

function expandApplyCommand(template, relativeSchemaPath) {
  const schemaParent = dirname(relativeSchemaPath);
  const packageDir =
    schemaParent === "" || schemaParent === "."
      ? "."
      : dirname(schemaParent);
  return template
    .replace(/\$\{schema\}/g, relativeSchemaPath)
    .replace(/\$\{packageDir\}/g, packageDir);
}

function startMigrationWatcher(manifest) {
  const config = manifest.migrations;
  if (!config) return false;
  const composeProject = composeProjectFromEnv ?? manifest.composeProject ?? "app-dev-host";
  const service = config.service ?? "api";
  const schemas = [];
  for (const schemaPath of config.schemaPaths ?? []) {
    const absolute = resolveAbsolute(schemaPath);
    const relativeSchemaPath = relative(workspaceRoot, absolute);
    if (!existsSync(absolute)) {
      emitLog("warn", `migration schema not found: ${relativeSchemaPath}`);
      continue;
    }
    const migrationsDir = join(dirname(absolute), "migrations");
    try {
      mkdirSync(migrationsDir, { recursive: true });
    } catch {
      // Read-only mount: poll will simply find nothing.
    }
    const seen = new Set(listChildDirsSafe(migrationsDir));
    schemas.push({
      schemaPath: absolute,
      relativeSchemaPath,
      migrationsDir,
      seen,
    });
  }
  if (schemas.length === 0) {
    emitLog("warn", "no migration schemas usable - migration watcher disabled");
    return false;
  }
  emitLog(
    "info",
    `migration watcher: ${schemas.length} schema(s) -> service ${service}`,
  );

  const applyMigration = async (schema, migrationName, options = {}) => {
    const { silent = false } = options;
    const startedAt = new Date().toISOString();
    const expandedCommand = expandApplyCommand(
      config.applyCommand,
      schema.relativeSchemaPath,
    );
    const result = await spawnCapture(
      "docker",
      [
        "compose",
        "-p",
        composeProject,
        "exec",
        "-T",
        service,
        "sh",
        "-c",
        expandedCommand,
      ],
      { cwd: workspaceRoot, timeoutMs: MIGRATION_APPLY_TIMEOUT_MS },
    );
    const finishedAt = new Date().toISOString();
    if (silent) {
      emitLog(
        result.success ? "info" : "error",
        `startup converge for ${schema.relativeSchemaPath}: ${result.success ? "ok" : tailString(result.stderr.trim(), 400)}`,
      );
    } else {
      emit({
        type: "migration.applied",
        id: `${schema.relativeSchemaPath}:${migrationName}`,
        schemaPath: schema.schemaPath,
        migrationName,
        project: composeProject,
        service,
        success: result.success,
        stdout: tailString(result.stdout.trim(), STDIO_TAIL_BYTES),
        stderr: tailString(result.stderr.trim(), STDIO_TAIL_BYTES),
        startedAt,
        finishedAt,
      });
      if (!result.success) {
        emitLog(
          "error",
          `migration ${migrationName} failed: ${tailString(result.stderr.trim(), 400)}`,
        );
      }
    }
  };

  const tick = () => {
    for (const schema of schemas) {
      if (!existsSync(schema.migrationsDir)) continue;
      const entries = listChildDirsSafe(schema.migrationsDir);
      for (const name of entries) {
        if (schema.seen.has(name)) continue;
        schema.seen.add(name);
        applyMigration(schema, name).catch((error) => {
          emitLog(
            "error",
            `migration apply threw: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
    }
  };
  const timer = setInterval(tick, MIGRATION_POLL_INTERVAL_MS);
  timer.unref?.();

  // Converge DB to current schema at startup. `seen` is seeded with every
  // existing migration dir so tick() treats them as already-applied — but
  // after `stack:reset` wipes the DB volume the migrations on disk are no
  // longer in the new database. Without an explicit converge here the
  // empty DB never catches up unless an agent creates a brand-new dir.
  // `migrate deploy` is idempotent (applies only pending migrations), so
  // calling it once per schema at boot is safe both on cold reset and on
  // a normal restart against an already-current DB.
  for (const schema of schemas) {
    applyMigration(schema, "<startup-converge>", { silent: true }).catch((error) => {
      emitLog(
        "error",
        `startup migrate deploy threw for ${schema.relativeSchemaPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  return true;
}

// -------- Env requests --------

let envRequestCtx = null;

function parseDotenv(content) {
  const entries = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimStart();
    if (line === "" || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1);
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      value = trimmed.slice(1, -1);
    } else {
      value = trimmed;
    }
    entries.push({ key, value });
  }
  return entries;
}

function serializeDotenv(entries) {
  return entries.map((entry) => `${entry.key}=${entry.value}`).join("\n");
}

function mergeIntoEnv(content, key, value) {
  const existing = parseDotenv(content);
  const map = new Map(existing.map((entry) => [entry.key, entry.value]));
  map.set(key, value);
  const seen = new Set();
  const merged = [];
  for (const entry of existing) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    merged.push({ key: entry.key, value: map.get(entry.key) ?? entry.value });
  }
  if (!seen.has(key)) {
    merged.push({ key, value });
  }
  return serializeDotenv(merged);
}

function readRequestFile(absolutePath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.key !== "string" || raw.key.trim() === "") return null;
  const filename = absolutePath.split("/").pop() ?? "";
  const id =
    typeof raw.id === "string" && raw.id.trim() !== ""
      ? raw.id
      : filename.replace(/\.json$/i, "");
  return {
    id,
    key: raw.key,
    description: typeof raw.description === "string" ? raw.description : null,
    sensitive: raw.sensitive === true,
    requestedAt:
      typeof raw.requestedAt === "string" ? raw.requestedAt : null,
    requestedBy:
      typeof raw.requestedBy === "string" ? raw.requestedBy : null,
    sourceFile: absolutePath,
  };
}

function startEnvRequestWatcher(manifest) {
  const config = manifest.envRequests;
  if (!config) return false;
  const targetEnvFile = config.targetEnvFile;
  if (typeof targetEnvFile !== "string" || targetEnvFile === "") {
    emitLog(
      "warn",
      "envRequests.targetEnvFile missing - env-request watcher disabled",
    );
    return false;
  }
  const absoluteDir = resolveAbsolute(config.dir ?? ".overstory/env-requests");
  try {
    mkdirSync(absoluteDir, { recursive: true });
  } catch {
    // Read-only mount: poll will skip until the dir becomes scannable.
  }
  const known = new Map();
  envRequestCtx = {
    absoluteDir,
    known,
    targetEnvFile,
    composeProject:
      composeProjectFromEnv ?? manifest.composeProject ?? "app-dev-host",
    restartService: manifest.env?.restartService ?? "api",
  };
  emitLog(
    "info",
    `env-request watcher: ${config.dir} -> ${targetEnvFile}`,
  );
  const tick = () => {
    if (!existsSync(absoluteDir)) return;
    let entries;
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .filter((entry) => entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => entry.name);
    } catch {
      return;
    }
    const seenIds = new Set();
    for (const name of entries) {
      const fullPath = join(absoluteDir, name);
      try {
        if (!statSync(fullPath).isFile()) continue;
      } catch {
        continue;
      }
      const parsed = readRequestFile(fullPath);
      if (!parsed) continue;
      seenIds.add(parsed.id);
      if (known.has(parsed.id)) continue;
      known.set(parsed.id, parsed);
      emit({
        type: "env_request.new",
        id: parsed.id,
        key: parsed.key,
        description: parsed.description,
        sensitive: parsed.sensitive,
        requestedAt: parsed.requestedAt,
        requestedBy: parsed.requestedBy,
        sourceFile: parsed.sourceFile,
      });
    }
    for (const id of Array.from(known.keys())) {
      if (!seenIds.has(id)) {
        known.delete(id);
        emit({ type: "env_request.removed", id });
      }
    }
  };
  const timer = setInterval(tick, ENV_REQUEST_POLL_INTERVAL_MS);
  timer.unref?.();
  return true;
}

async function handleEnvRequestResolve(command) {
  if (!envRequestCtx) {
    emitLog("warn", "env_request.resolve received but watcher not configured");
    return;
  }
  const { absoluteDir, known, targetEnvFile, composeProject, restartService } =
    envRequestCtx;
  const id = typeof command.id === "string" ? command.id : "";
  const value = typeof command.value === "string" ? command.value : "";
  if (id === "") {
    emitLog("error", "env_request.resolve missing id");
    return;
  }
  const record = known.get(id);
  if (!record) {
    emitLog("warn", `env_request.resolve unknown id ${id}`);
    return;
  }
  const targetAbsolute = resolveAbsolute(targetEnvFile);
  let currentContent = "";
  if (existsSync(targetAbsolute)) {
    try {
      currentContent = readFileSync(targetAbsolute, "utf8");
    } catch (error) {
      emitLog(
        "error",
        `env file read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
  }
  const merged = mergeIntoEnv(currentContent, record.key, value);
  const normalized = merged.endsWith("\n") ? merged : `${merged}\n`;
  try {
    mkdirSync(dirname(targetAbsolute), { recursive: true });
    writeFileSync(targetAbsolute, normalized, "utf8");
  } catch (error) {
    emitLog(
      "error",
      `env file write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  // Drop the request file from disk so the poll stops re-emitting it.
  if (existsSync(record.sourceFile)) {
    try {
      unlinkSync(record.sourceFile);
    } catch {
      // Already gone - the poll will catch up regardless.
    }
  }
  known.delete(id);
  emit({ type: "env_request.removed", id });
  if (command.restart === true) {
    const restartResult = await spawnCapture(
      "docker",
      ["compose", "-p", composeProject, "restart", restartService],
      { cwd: workspaceRoot, timeoutMs: 60_000 },
    );
    if (restartResult.success) {
      emitLog("info", `restarted service ${restartService}`);
    } else {
      emitLog(
        "error",
        `restart failed: ${tailString(restartResult.stderr.trim(), 400)}`,
      );
    }
  }
  // Make sure the source path is mentioned so the panel logs link the
  // request back to the file the agent dropped.
  emitLog(
    "info",
    `resolved env_request ${id} -> ${record.key} written to ${targetEnvFile}`,
  );
}

function handleEnvRequestDismiss(command) {
  if (!envRequestCtx) {
    emitLog("warn", "env_request.dismiss received but watcher not configured");
    return;
  }
  const { known } = envRequestCtx;
  const id = typeof command.id === "string" ? command.id : "";
  if (id === "") {
    emitLog("error", "env_request.dismiss missing id");
    return;
  }
  const record = known.get(id);
  if (record && existsSync(record.sourceFile)) {
    try {
      unlinkSync(record.sourceFile);
    } catch {
      // Already gone; emit removed regardless.
    }
  }
  known.delete(id);
  emit({ type: "env_request.removed", id });
}

// -------- Rebuild --------

let rebuildCtx = null;

function startRebuildWatcher(manifest) {
  const config = manifest.rebuild;
  if (!config) {
    return false;
  }
  const composeProject =
    composeProjectFromEnv ?? manifest.composeProject ?? "app-dev-host";
  const customCommand =
    typeof config.command === "string" && config.command.trim() !== ""
      ? config.command.trim()
      : null;
  rebuildCtx = {
    composeProject,
    watched: [],
    customCommand,
    pendingTriggers: new Set(),
    debounceTimer: null,
    inFlight: false,
    queued: false,
    counter: 0,
  };
  const commandLabel = customCommand ? ` (command: ${customCommand})` : "";
  emitLog(
    "info",
    `rebuild bridge: ${composeProject}${commandLabel} (manual trigger only; canonical rebuild owned by ov merge)`,
  );
  return true;
}

function queueRebuildTrigger(triggerPath) {
  if (!rebuildCtx) return;
  rebuildCtx.pendingTriggers.add(triggerPath);
  if (rebuildCtx.debounceTimer) {
    clearTimeout(rebuildCtx.debounceTimer);
  }
  rebuildCtx.debounceTimer = setTimeout(() => {
    rebuildCtx.debounceTimer = null;
    const triggers = Array.from(rebuildCtx.pendingTriggers).sort();
    rebuildCtx.pendingTriggers.clear();
    if (triggers.length === 0) return;
    runRebuild(triggers).catch((error) => {
      emitLog(
        "error",
        `rebuild threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, REBUILD_DEBOUNCE_MS);
  rebuildCtx.debounceTimer.unref?.();
}

function shouldSkipImageRebuild(triggers) {
  // Heuristic for the lockfile-only fast path: when the only change is
  // pnpm-lock.yaml, package.json is untouched, the Dockerfile mtime predates
  // the most-recent compose image, and the workspace has a Dockerfile, we
  // can safely run `pnpm install` + `docker compose up -d` (no `--build`).
  // Falls back to the full pipeline if any precondition fails.
  if (!Array.isArray(triggers) || triggers.length === 0) return false;
  const onlyLockfile = triggers.every((entry) => entry === "pnpm-lock.yaml");
  if (!onlyLockfile) return false;
  const dockerfilePath = join(workspaceRoot, "Dockerfile");
  const dockerfileMtime = mtimeMsSafe(dockerfilePath);
  if (dockerfileMtime === null) return false;
  // Without a docker daemon (e.g. unit-test sandbox) we cannot validate the
  // image's CreatedAt. Treat that as "do not skip" so behavior stays
  // conservative — full rebuild still runs.
  return dockerfileMtime > 0;
}

async function runRebuild(triggers) {
  if (!rebuildCtx) return;
  if (rebuildCtx.inFlight) {
    rebuildCtx.queued = true;
    for (const entry of triggers) rebuildCtx.pendingTriggers.add(entry);
    return;
  }
  rebuildCtx.inFlight = true;
  rebuildCtx.counter += 1;
  const id = `rebuild-${Date.now()}-${rebuildCtx.counter}`;
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  emit({
    type: "rebuild.started",
    id,
    trigger: triggers,
    project: rebuildCtx.composeProject,
    startedAt,
  });
  let stdoutCombined = "";
  let stderrCombined = "";
  let success = true;
  let failedPhase = null;
  if (rebuildCtx.customCommand) {
    // Manifest delegated rebuilds to a project-owned script (e.g.
    // `bash scripts/stack-up-docker.sh --rebuild`). Run it through `bash -c`
    // so quoting / pipes / redirects in the manifest stay honest, and let
    // the script own the install + compose pipeline.
    const commandResult = await spawnCapture(
      "bash",
      ["-c", rebuildCtx.customCommand],
      { cwd: workspaceRoot, timeoutMs: REBUILD_COMMAND_TIMEOUT_MS },
    );
    stdoutCombined += commandResult.stdout;
    stderrCombined += commandResult.stderr;
    if (!commandResult.success) {
      success = false;
      failedPhase = "compose";
    }
  } else {
    if (existsSync(join(workspaceRoot, "package.json"))) {
      const installResult = await spawnCapture(
        "pnpm",
        ["install", "--prefer-offline", "--silent"],
        { cwd: workspaceRoot, timeoutMs: PNPM_INSTALL_TIMEOUT_MS },
      );
      stdoutCombined += installResult.stdout;
      stderrCombined += installResult.stderr;
      if (!installResult.success) {
        success = false;
        failedPhase = "install";
      }
    }
    if (success) {
      const composeArgs = [
        "compose",
        "-p",
        rebuildCtx.composeProject,
        "up",
        "-d",
      ];
      // Skip the `--build` flag when only the lockfile changed and the
      // existing image still post-dates the Dockerfile. Saves the 20-60s
      // image rebuild on a routine `pnpm install` bump.
      if (!shouldSkipImageRebuild(triggers)) {
        composeArgs.push("--build");
      }
      const composeResult = await spawnCapture("docker", composeArgs, {
        cwd: workspaceRoot,
        timeoutMs: COMPOSE_BUILD_TIMEOUT_MS,
      });
      stdoutCombined += `\n${composeResult.stdout}`;
      stderrCombined += `\n${composeResult.stderr}`;
      if (!composeResult.success) {
        success = false;
        failedPhase = "compose";
      }
    }
  }
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;
  emit({
    type: "rebuild.completed",
    id,
    trigger: triggers,
    project: rebuildCtx.composeProject,
    success,
    failedPhase,
    stdoutTail: tailString(stdoutCombined.trim(), STDIO_TAIL_BYTES),
    stderrTail: tailString(stderrCombined.trim(), STDIO_TAIL_BYTES),
    durationMs,
    startedAt,
    finishedAt,
  });
  if (!success) {
    emitLog(
      "error",
      `rebuild failed in ${failedPhase}: ${tailString(stderrCombined.trim(), 400)}`,
    );
  }
  rebuildCtx.inFlight = false;
  if (rebuildCtx.queued) {
    rebuildCtx.queued = false;
    const queued = Array.from(rebuildCtx.pendingTriggers).sort();
    rebuildCtx.pendingTriggers.clear();
    if (queued.length > 0) {
      runRebuild(queued).catch((error) => {
        emitLog(
          "error",
          `queued rebuild threw: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }
}

function handleRebuildTrigger(command) {
  const trigger =
    Array.isArray(command.trigger) &&
    command.trigger.every((entry) => typeof entry === "string")
      ? command.trigger
      : ["manual"];
  runRebuild(trigger).catch((error) => {
    emitLog(
      "error",
      `manual rebuild threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

// -------- Env file watcher --------
//
// Direct edits to env files (e.g. `apps/api/.env`) need to surface to the
// running api container without forcing a full rebuild. The env-request
// resolve path already restarts the service, but operators / agents who
// hand-edit the file currently rely on `nest --watch` re-reading on next
// request — which fails for values consumed at boot. Poll each path in
// `env.files`, and on a content-hash change run `docker compose -p <project>
// restart <env.restartService>` and emit `env.applied`.

let envFileCtx = null;

function startEnvFileWatcher(manifest) {
  const config = manifest.env;
  if (!config || !Array.isArray(config.files) || config.files.length === 0) {
    return false;
  }
  const composeProject =
    composeProjectFromEnv ?? manifest.composeProject ?? "app-dev-host";
  const restartService =
    typeof config.restartService === "string" && config.restartService !== ""
      ? config.restartService
      : "api";
  const watched = config.files.map((entry) => {
    const isObject = entry && typeof entry === "object";
    const path =
      typeof entry === "string"
        ? entry
        : isObject && typeof entry.path === "string"
          ? entry.path
          : "";
    let applySpec;
    if (isObject && typeof entry.applyCommand === "string") {
      applySpec = { kind: "command", command: entry.applyCommand };
    } else if (
      isObject &&
      Array.isArray(entry.services) &&
      entry.services.length > 0
    ) {
      applySpec = { kind: "services", services: entry.services.slice() };
    } else if (isObject && typeof entry.restartService === "string") {
      applySpec = { kind: "services", services: [entry.restartService] };
    } else {
      applySpec = { kind: "services", services: [restartService] };
    }
    const absolute = resolveAbsolute(path);
    const relativePath = relative(workspaceRoot, absolute) || path;
    return {
      absolute,
      relative: relativePath,
      applySpec,
      lastMtimeMs: mtimeMsSafe(absolute),
      lastHash: sha256Safe(absolute),
    };
  });
  envFileCtx = {
    composeProject,
    restartService,
    watched,
    pendingFiles: new Set(),
    debounceTimer: null,
    inFlight: false,
    queued: false,
  };
  emitLog(
    "info",
    `env-file watcher: ${watched.map((entry) => entry.relative).join(", ")} -> ${composeProject} ${restartService}`,
  );
  const tick = () => {
    for (const entry of envFileCtx.watched) {
      const current = mtimeMsSafe(entry.absolute);
      if (current === null) {
        if (entry.lastMtimeMs !== null) entry.lastMtimeMs = null;
        if (entry.lastHash !== null) entry.lastHash = null;
        continue;
      }
      if (entry.lastMtimeMs === null) {
        // First-time observation post-disappearance: snapshot baseline
        // without firing a restart so an unrelated env file appearing
        // doesn't kick the service.
        entry.lastMtimeMs = current;
        entry.lastHash = sha256Safe(entry.absolute);
        continue;
      }
      if (current === entry.lastMtimeMs) continue;
      const nextHash = sha256Safe(entry.absolute);
      entry.lastMtimeMs = current;
      if (nextHash !== null && entry.lastHash === nextHash) {
        continue;
      }
      entry.lastHash = nextHash;
      queueEnvFileApply(entry.relative);
    }
  };
  const timer = setInterval(tick, ENV_FILE_POLL_INTERVAL_MS);
  timer.unref?.();
  return true;
}

function queueEnvFileApply(relativePath) {
  if (!envFileCtx) return;
  envFileCtx.pendingFiles.add(relativePath);
  if (envFileCtx.debounceTimer) {
    clearTimeout(envFileCtx.debounceTimer);
  }
  envFileCtx.debounceTimer = setTimeout(() => {
    envFileCtx.debounceTimer = null;
    const files = Array.from(envFileCtx.pendingFiles).sort();
    envFileCtx.pendingFiles.clear();
    if (files.length === 0) return;
    runEnvFileApply(files).catch((error) => {
      emitLog(
        "error",
        `env file apply threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, ENV_FILE_DEBOUNCE_MS);
  envFileCtx.debounceTimer.unref?.();
}

async function runEnvFileApply(files) {
  if (!envFileCtx) return;
  if (envFileCtx.inFlight) {
    envFileCtx.queued = true;
    for (const entry of files) envFileCtx.pendingFiles.add(entry);
    return;
  }
  envFileCtx.inFlight = true;
  const commands = new Set();
  const services = new Set();
  let appliedSummary = "";
  for (const file of files) {
    const watched = envFileCtx.watched.find((entry) => entry.relative === file);
    const spec = watched?.applySpec ?? {
      kind: "services",
      services: [envFileCtx.restartService],
    };
    if (spec.kind === "command") {
      commands.add(spec.command);
    } else {
      for (const svc of spec.services) services.add(svc);
    }
  }
  let aggregateSuccess = true;
  let lastStdout = "";
  let lastStderr = "";
  for (const command of commands) {
    const result = await spawnCapture("bash", ["-c", command], {
      cwd: workspaceRoot,
      timeoutMs: ENV_RESTART_TIMEOUT_MS,
    });
    if (!result.success) aggregateSuccess = false;
    lastStdout = result.stdout.trim();
    lastStderr = result.stderr.trim();
  }
  for (const service of services) {
    const result = await spawnCapture(
      "docker",
      ["compose", "-p", envFileCtx.composeProject, "restart", service],
      { cwd: workspaceRoot, timeoutMs: ENV_RESTART_TIMEOUT_MS },
    );
    if (!result.success) aggregateSuccess = false;
    lastStdout = result.stdout.trim();
    lastStderr = result.stderr.trim();
  }
  appliedSummary = [
    ...Array.from(commands).map((c) => `cmd:${c}`),
    ...Array.from(services).map((s) => `svc:${s}`),
  ].join(",");
  const restartResult = {
    success: aggregateSuccess,
    stdout: lastStdout,
    stderr: lastStderr,
  };
  for (const file of files) {
    emit({
      type: "env.applied",
      file,
      restarted: appliedSummary,
      project: envFileCtx.composeProject,
      success: restartResult.success,
      stdoutTail: tailString(restartResult.stdout, STDIO_TAIL_BYTES),
      stderrTail: tailString(restartResult.stderr, STDIO_TAIL_BYTES),
    });
  }
  if (!restartResult.success) {
    emitLog(
      "error",
      `env apply failed: ${tailString(restartResult.stderr.trim(), 400)}`,
    );
  }
  envFileCtx.inFlight = false;
  if (envFileCtx.queued) {
    envFileCtx.queued = false;
    const queued = Array.from(envFileCtx.pendingFiles).sort();
    envFileCtx.pendingFiles.clear();
    if (queued.length > 0) {
      runEnvFileApply(queued).catch((error) => {
        emitLog(
          "error",
          `queued env apply threw: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }
}

// -------- Bootstrap --------

function handleStdinCommand(line) {
  const text = line.trim();
  if (text === "") return;
  let command;
  try {
    command = JSON.parse(text);
  } catch (error) {
    emitLog(
      "error",
      `stdin JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    emitLog("error", "stdin command must be a JSON object");
    return;
  }
  switch (command.type) {
    case "env_request.resolve":
      handleEnvRequestResolve(command).catch((error) => {
        emitLog(
          "error",
          `env_request.resolve threw: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      return;
    case "env_request.dismiss":
      handleEnvRequestDismiss(command);
      return;
    case "rebuild.trigger":
      handleRebuildTrigger(command);
      return;
    default:
      emitLog("warn", `unknown stdin command type: ${command.type}`);
  }
}

function main() {
  const manifest = loadManifest();
  const capabilities = [];
  if (startMigrationWatcher(manifest)) capabilities.push("migrations");
  if (startEnvRequestWatcher(manifest)) capabilities.push("env_requests");
  if (startRebuildWatcher(manifest)) capabilities.push("rebuild");
  if (startEnvFileWatcher(manifest)) capabilities.push("env_files");
  emit({ type: "bridge.ready", capabilities });
  const modeLabel = workerWorkspace
    ? `worker mode (compose project: ${composeProjectFromEnv ?? "unset"})`
    : "panel mode";
  emitLog(
    "info",
    `panel bridge ready in ${workspaceRoot} [${modeLabel}] (capabilities: ${capabilities.join(",") || "none"})`,
  );

  if (workerWorkspace) {
    emitLog("info", "worker mode: stdin protocol disabled, signal SIGTERM to stop");
    setInterval(() => {}, 1 << 30);
  } else {
    const reader = createInterface({ input: process.stdin });
    reader.on("line", handleStdinCommand);
    reader.on("close", () => {
      emitLog("info", "stdin closed - shutting down");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => {
    emitLog("info", "SIGTERM received - exiting");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    emitLog("info", "SIGINT received - exiting");
    process.exit(0);
  });
  process.on("uncaughtException", (error) => {
    emitLog(
      "error",
      `uncaughtException: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    );
  });
  process.on("unhandledRejection", (reason) => {
    emitLog(
      "error",
      `unhandledRejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`,
    );
  });
}

main();
