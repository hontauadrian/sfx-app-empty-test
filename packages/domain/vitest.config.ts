import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    passWithNoTests: true,
    poolOptions: {
      threads: {
        maxThreads: Number(process.env.VITEST_MAX_THREADS) || undefined,
        minThreads: Number(process.env.VITEST_MIN_THREADS) || undefined,
      },
      forks: {
        maxForks: Number(process.env.VITEST_MAX_THREADS) || undefined,
        minForks: Number(process.env.VITEST_MIN_THREADS) || undefined,
      },
    },
    coverage: {
      provider: "v8",
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
