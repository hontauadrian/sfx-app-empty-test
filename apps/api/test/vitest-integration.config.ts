import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.integration-test.ts"],
    alias: {
      "@sfx/domain": resolve(root, "../../packages/domain/src"),
      "@sfx/validation": resolve(root, "../../packages/validation/src"),
      "@sfx/shared": resolve(root, "../../packages/shared/src"),
      "@sfx/database": resolve(root, "../../packages/database/src"),
    },
  },
});
