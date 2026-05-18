import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.e2e-test.ts"],
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
  },
});
