import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    root: "src",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "../coverage",
      include: [
        "**/modules/health/application/controllers/**/*.ts",
        "**/modules/user/application/controllers/**/*.ts",
        "**/modules/user/application/pipes/**/*.ts",
      ],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
