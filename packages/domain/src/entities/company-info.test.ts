// Re-export the suite that lives under __tests__/. Vitest picks the
// file up via the include glob; this adjacent file exists to satisfy
// the same-directory test-discovery convention.
import "./__tests__/company-info.test";
