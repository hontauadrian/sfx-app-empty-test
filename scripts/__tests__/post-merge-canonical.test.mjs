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
});
