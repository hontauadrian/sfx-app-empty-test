import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
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
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/node_modules/**",
        "**/.next/**",
        "**/dist/**",
        "**/__tests__/**",
        "**/__integration__/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.integration-test.ts",
        "**/*.integration-test.tsx",
        "**/page.tsx",
        "**/layout.tsx",
        "**/providers.tsx",
        "**/types.ts",
        "**/types/**",
        "**/index.ts",
        "src/features/presentation/localization/languages/en/**",
        "src/features/presentation/localization/languages/ro/**",
      ],
    },
  },
});
