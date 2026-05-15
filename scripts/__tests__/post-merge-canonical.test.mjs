import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("post-merge-canonical", () => {
  it("smoke-tests only baseline endpoints that exist in the boilerplate", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "post-merge-canonical.sh"), "utf8");

    assert.match(script, /\/api\/v1\/health/);
    assert.match(script, /\/api\/docs-json/);
    assert.doesNotMatch(script, /\/api\/v1\/teams/);
  });

  it("polls api readiness instead of relying on a fixed sleep before smoke", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "post-merge-canonical.sh"), "utf8");

    assert.match(
      script,
      /POST_MERGE_READY_TIMEOUT/,
      "script must expose POST_MERGE_READY_TIMEOUT env override for the readiness poll",
    );
    assert.match(
      script,
      /while true; do[\s\S]*health/,
      "script must contain a while-loop polling /api/v1/health for readiness",
    );
    assert.doesNotMatch(
      script,
      /^sleep 4$/m,
      "script must not rely on the legacy fixed sleep before smoke; use a readiness poll",
    );
  });
});
