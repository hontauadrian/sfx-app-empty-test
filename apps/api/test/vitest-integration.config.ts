import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Integration tests share one Postgres + Prisma client. Running files
    // concurrently in separate forks races on prisma.brand.deleteMany() —
    // serialize files (single fork, no parallelism) so each test file's
    // beforeEach cleanup is atomic relative to other files. Within a file
    // tests already run sequentially.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    include: ["**/*.integration-test.ts"],
    fileParallelism: false,
    alias: {
      "@sfx/domain": resolve(root, "../../packages/domain/src"),
      "@sfx/validation": resolve(root, "../../packages/validation/src"),
      "@sfx/shared": resolve(root, "../../packages/shared/src"),
      "@sfx/database": resolve(root, "../../packages/database/src"),
    },
  },
});
