import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "probe-run-with-ownership-check.sh");

describe("probe-run-with-ownership-check.sh — env hydration", () => {
  it("sources .env.runtime so OAuth/port placeholders survive into the probe subshell", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");

    assert.match(
      script,
      /\.env\.runtime/,
      "script must reference .env.runtime — it is the contract handoff from probe-bootstrap.sh",
    );
    // Be lenient on the exact `set -a; . .env.runtime; set +a` shape but
    // require it to (a) guard on file existence and (b) toggle export
    // mode so the sourced assignments propagate as exported env vars,
    // not just shell-local. This is the architectural counterpart to
    // probe-bootstrap.sh's own internal `. "$runtime_env_file"` step,
    // but for the next pipeline segment.
    assert.match(
      script,
      /\[ -f \.env\.runtime \][\s\S]*set -a/,
      "script must guard on the file existing AND enable `set -a` before sourcing — otherwise sourced vars do not export",
    );
    assert.match(
      script,
      /set -a[\s\S]*\.env\.runtime[\s\S]*set \+a/,
      "script must toggle `set -a` on, source, then `set +a` — anything else either leaks export mode or skips the export",
    );
  });

  it("performs the .env.runtime source BEFORE invoking the probe entry", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    const sourceIdx = script.indexOf(".env.runtime");
    const probeIdx = script.search(/node\s+-r\s+@swc-node\/register/);

    assert.notStrictEqual(sourceIdx, -1, ".env.runtime reference missing");
    assert.notStrictEqual(probeIdx, -1, "probe invocation missing");
    assert.ok(
      sourceIdx < probeIdx,
      "the .env.runtime source MUST happen before the node probe entry — otherwise placeholders are unresolved at probe time",
    );
  });
});
