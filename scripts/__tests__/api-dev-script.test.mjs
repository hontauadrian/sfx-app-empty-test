import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("apps/api dev script rebuild step", () => {
  // The api Dockerfile (development stage) builds @sfx/domain, @sfx/shared,
  // @sfx/validation, and @sfx/database to dist at IMAGE BUILD TIME. The
  // running compose service bind-mounts only packages/<x>/src, NOT
  // packages/<x>/dist. When a worker (or any branch) adds a new schema or
  // entity to packages/*/src after the image was built, the running
  // container has src visible but dist still reflects the canonical
  // boilerplate. nest dev does not rebuild workspace deps, so the new
  // export resolves to undefined and @sfx/api crashes at module load.
  //
  // The dev script therefore runs `pnpm -r --filter ... run build` BEFORE
  // `nest start`. This costs ~3-4s on every container start but guarantees
  // dist matches src across stack:reset/stack:up cycles in worker stacks.
  it("runs pnpm -r build for workspace deps before nest start", () => {
    const apiPackageJson = JSON.parse(
      readFileSync(join(REPO_ROOT, "apps", "api", "package.json"), "utf8"),
    );
    const devScript = apiPackageJson.scripts?.dev ?? "";

    assert.match(
      devScript,
      /pnpm -r .* run build/,
      "dev script must run pnpm -r build for workspace deps before nest start",
    );
    assert.match(devScript, /--filter "@sfx\/domain"/);
    assert.match(devScript, /--filter "@sfx\/shared"/);
    assert.match(devScript, /--filter "@sfx\/validation"/);
    assert.match(devScript, /--filter "@sfx\/database"/);
    assert.match(
      devScript,
      /run build && nest start -b swc --watch$/,
      "rebuild step must precede nest start so dist is fresh when SWC compiles imports",
    );
  });
});
