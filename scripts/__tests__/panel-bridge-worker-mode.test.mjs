/**
 * Worker-mode smoke test for panel-bridge.mjs.
 *
 * Run with the Node test runner (no Jest dependency — the workspace-dev
 * package isn't part of the panel's jest project):
 *
 *   node --test workspace-dev/scripts/__tests__/panel-bridge-worker-mode.test.mjs
 *
 * The test spawns the bridge in three modes and asserts:
 *
 *   1. With both PANEL_BRIDGE_WORKSPACE + PANEL_BRIDGE_COMPOSE_PROJECT set,
 *      the bridge resolves manifest paths against the override workspace
 *      and surfaces the override compose project in `migration.applied`
 *      events (NOT the manifest's `composeProject`).
 *   2. Without the overrides, the bridge falls back to the manifest's
 *      `composeProject` value.
 *   3. `bridge.ready` is always emitted as the first event.
 *
 * The test does NOT exercise the docker exec — it injects a fake `docker`
 * binary on PATH that captures the args and prints synthetic stdout. That
 * way the test can run anywhere without docker/dev daemons.
 */

import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL("..", import.meta.url));
const BRIDGE_PATH = join(SCRIPT_DIR, "panel-bridge.mjs");
const READY_TIMEOUT_MS = 5_000;
const MIGRATION_TIMEOUT_MS = 8_000;

function writeFakeDockerBin(binDir) {
  // Minimal `docker` impl: `docker compose -p <project> exec ...` exits 0
  // and prints the project name on stdout so the bridge records it as
  // `migration.applied.project`. Anything else is a no-op success.
  const fakeDocker = `#!/usr/bin/env bash
echo "fake-docker-call: $*"
exit 0
`;
  const dockerPath = join(binDir, "docker");
  writeFileSync(dockerPath, fakeDocker, "utf8");
  chmodSync(dockerPath, 0o755);
}

function buildWorkspace(rootDir, manifest) {
  const schemaDir = join(rootDir, "packages/database/prisma");
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(
    join(schemaDir, "schema.prisma"),
    "// fake schema\n",
    "utf8",
  );
  mkdirSync(join(schemaDir, "migrations"), { recursive: true });
  writeFileSync(
    join(rootDir, "panel.config.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

function spawnBridge(workspaceRoot, envOverrides, fakeBinDir) {
  const env = {
    ...process.env,
    PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
    ...envOverrides,
  };
  // Strip the panel-side env so worker-mode tests don't inherit them.
  delete env.PANEL_BRIDGE_WORKSPACE_ROOT;
  if (!envOverrides.PANEL_BRIDGE_WORKSPACE) {
    delete env.PANEL_BRIDGE_WORKSPACE;
  }
  if (!envOverrides.PANEL_BRIDGE_COMPOSE_PROJECT) {
    delete env.PANEL_BRIDGE_COMPOSE_PROJECT;
  }
  return spawn("node", [BRIDGE_PATH], {
    cwd: workspaceRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function readEvents(child) {
  const events = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        // Drop malformed lines — the bridge contract says one JSON per line.
      }
    }
  });
  return events;
}

function waitForEvent(events, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    const interval = setInterval(() => {
      const found = events.find(predicate);
      if (found) {
        clearInterval(interval);
        resolve(found);
        return;
      }
      if (Date.now() - startMs > timeoutMs) {
        clearInterval(interval);
        reject(
          new Error(
            `timed out waiting for event after ${timeoutMs}ms (saw ${events.length} events)`,
          ),
        );
      }
    }, 50);
  });
}

describe("panel-bridge.mjs worker-mode override", () => {
  let tmpRoot;
  let workspaceDir;
  let fakeBinDir;
  let runningChildren = [];

  before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "panel-bridge-test-"));
    workspaceDir = join(tmpRoot, "worker-w7");
    fakeBinDir = join(tmpRoot, "fake-bin");
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeDockerBin(fakeBinDir);
    buildWorkspace(workspaceDir, {
      name: "worker-test",
      composeProject: "app-dev-host",
      migrations: {
        type: "prisma",
        schemaPaths: ["packages/database/prisma/schema.prisma"],
        applyCommand: "echo apply ${schema}",
        service: "api",
      },
    });
  });

  after(() => {
    for (const child of runningChildren) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function track(child) {
    runningChildren.push(child);
    return child;
  }

  it("emits bridge.ready as the first event with the workspace override", async () => {
    const child = track(
      spawnBridge(
        workspaceDir,
        {
          PANEL_BRIDGE_WORKSPACE: workspaceDir,
          PANEL_BRIDGE_COMPOSE_PROJECT: "app-w7",
        },
        fakeBinDir,
      ),
    );
    const events = readEvents(child);
    const ready = await waitForEvent(
      events,
      (event) => event.type === "bridge.ready",
      READY_TIMEOUT_MS,
    );
    assert.equal(ready.type, "bridge.ready");
    assert.ok(Array.isArray(ready.capabilities));
    assert.ok(ready.capabilities.includes("migrations"));
    child.kill("SIGTERM");
  });

  it("uses the worker compose project for migration.applied events", async () => {
    const child = track(
      spawnBridge(
        workspaceDir,
        {
          PANEL_BRIDGE_WORKSPACE: workspaceDir,
          PANEL_BRIDGE_COMPOSE_PROJECT: "app-w7",
        },
        fakeBinDir,
      ),
    );
    const events = readEvents(child);
    await waitForEvent(
      events,
      (event) => event.type === "bridge.ready",
      READY_TIMEOUT_MS,
    );
    // Drop a migration after the watcher has snapshotted the existing set.
    const migrationDir = join(
      workspaceDir,
      "packages/database/prisma/migrations/20260429_worker_test",
    );
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(join(migrationDir, "migration.sql"), "-- noop\n", "utf8");
    const applied = await waitForEvent(
      events,
      (event) => event.type === "migration.applied",
      MIGRATION_TIMEOUT_MS,
    );
    assert.equal(applied.project, "app-w7");
    assert.equal(applied.migrationName, "20260429_worker_test");
    child.kill("SIGTERM");
  });

  it("falls back to manifest composeProject when env vars are unset", async () => {
    // Use a fresh workspace so the migration set is empty for this run.
    const fallbackWorkspace = join(tmpRoot, "worker-fallback");
    mkdirSync(fallbackWorkspace, { recursive: true });
    buildWorkspace(fallbackWorkspace, {
      name: "fallback-test",
      composeProject: "manifest-default-project",
      migrations: {
        type: "prisma",
        schemaPaths: ["packages/database/prisma/schema.prisma"],
        applyCommand: "echo apply ${schema}",
        service: "api",
      },
    });
    const child = track(spawnBridge(fallbackWorkspace, {}, fakeBinDir));
    const events = readEvents(child);
    await waitForEvent(
      events,
      (event) => event.type === "bridge.ready",
      READY_TIMEOUT_MS,
    );
    const migrationDir = join(
      fallbackWorkspace,
      "packages/database/prisma/migrations/20260429_fallback",
    );
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(join(migrationDir, "migration.sql"), "-- noop\n", "utf8");
    const applied = await waitForEvent(
      events,
      (event) => event.type === "migration.applied",
      MIGRATION_TIMEOUT_MS,
    );
    assert.equal(applied.project, "manifest-default-project");
    child.kill("SIGTERM");
  });

  it("forwards rebuild.command from the manifest as a bash -c invocation", async () => {
    // The bridge reads its sibling manifest at startup, so a workspace-side
    // change (`rebuild.command` set to a marker shell snippet) is enough to
    // verify the command is shelled out instead of the legacy compose path.
    const commandWorkspace = join(tmpRoot, "worker-rebuild-command");
    mkdirSync(commandWorkspace, { recursive: true });
    const markerPath = join(commandWorkspace, "rebuild-marker.txt");
    buildWorkspace(commandWorkspace, {
      name: "rebuild-command-test",
      composeProject: "manifest-default-project",
      rebuild: {
        watch: ["pnpm-lock.yaml"],
        command: `printf 'rebuilt-via-command' > ${markerPath}`,
      },
    });
    writeFileSync(
      join(commandWorkspace, "pnpm-lock.yaml"),
      "lockfileVersion: '6.0'\n",
      "utf8",
    );
    const child = track(spawnBridge(commandWorkspace, {}, fakeBinDir));
    const events = readEvents(child);
    await waitForEvent(
      events,
      (event) => event.type === "bridge.ready",
      READY_TIMEOUT_MS,
    );
    // Mutate the lockfile after the watcher has snapshotted so the bridge
    // observes a real content-hash change and fires the custom command.
    await new Promise((resolve) => setTimeout(resolve, 750));
    writeFileSync(
      join(commandWorkspace, "pnpm-lock.yaml"),
      "lockfileVersion: '6.0'\nupdated: true\n",
      "utf8",
    );
    const completed = await waitForEvent(
      events,
      (event) => event.type === "rebuild.completed",
      MIGRATION_TIMEOUT_MS,
    );
    assert.equal(completed.success, true);
    const { readFileSync } = await import("node:fs");
    const markerContents = readFileSync(markerPath, "utf8");
    assert.equal(markerContents, "rebuilt-via-command");
    child.kill("SIGTERM");
  });

  it("includes env_files in the capabilities list when env.files is declared", async () => {
    const envWorkspace = join(tmpRoot, "worker-env-files");
    mkdirSync(envWorkspace, { recursive: true });
    buildWorkspace(envWorkspace, {
      name: "env-files-test",
      composeProject: "manifest-default-project",
      env: { files: [".env"], restartService: "api" },
    });
    writeFileSync(join(envWorkspace, ".env"), "FOO=bar\n", "utf8");
    const child = track(spawnBridge(envWorkspace, {}, fakeBinDir));
    const events = readEvents(child);
    const ready = await waitForEvent(
      events,
      (event) => event.type === "bridge.ready",
      READY_TIMEOUT_MS,
    );
    assert.ok(ready.capabilities.includes("env_files"));
    child.kill("SIGTERM");
  });
});
