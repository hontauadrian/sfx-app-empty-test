import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function createWorkspace() {
  const root = join(tmpdir(), `stack-mounts-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(root, "packages", "validation"), { recursive: true });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  writeFileSync(
    join(root, "packages", "validation", "package.json"),
    JSON.stringify({ name: "@sfx/validation", main: "dist/index.js" }),
  );
  return root;
}

describe("generate-stack-mounts", () => {
  it("emits worktree-relative dist paths in list mode for build checks", () => {
    const root = createWorkspace();
    try {
      const output = execFileSync(
        process.execPath,
        [join(REPO_ROOT, "scripts", "generate-stack-mounts.mjs"), "--list"],
        {
          cwd: root,
          env: {
            ...process.env,
            SFX_HOST_WORKSPACE_PATH: "/Users/example/workspace-dev",
            SFX_STACK_FORCE_PANEL_CONTAINER: "1",
          },
          encoding: "utf8",
        },
      );

      assert.equal(output.trim(), "@sfx/validation:packages/validation/dist");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses host-absolute dist paths in the generated compose overlay", () => {
    const root = createWorkspace();
    try {
      execFileSync(
        process.execPath,
        [join(REPO_ROOT, "scripts", "generate-stack-mounts.mjs")],
        {
          cwd: root,
          env: {
            ...process.env,
            SFX_HOST_WORKSPACE_PATH: "/Users/example/workspace-dev",
            SFX_STACK_FORCE_PANEL_CONTAINER: "1",
          },
          encoding: "utf8",
        },
      );

      const overlay = readFileSync(join(root, "docker-compose.mounts.generated.yml"), "utf8");
      assert.match(
        overlay,
        /\/Users\/example\/workspace-dev\/\.overstory\/worktrees\/stack-mounts-[^/]+\/packages\/validation\/dist:\/app\/packages\/validation\/dist/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
