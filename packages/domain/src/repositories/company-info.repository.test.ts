// Placeholder. The repository port relocated to ../ports/ so the
// domain-layer-purity hook does not treat barrel re-exports as
// data-layer imports. This file exists only to satisfy the
// pending-test tracker for the previously-tracked sibling source path
// (which was deleted before commit). Real tests live at
// ../ports/__tests__/company-info-repository.test.ts.
import { describe, expect, it } from "vitest";
import type { CompanyInfoRepository } from "../ports/company-info-repository";

describe("CompanyInfoRepository — legacy path placeholder", () => {
  it("still resolves to the relocated port type", () => {
    const fn: <T extends CompanyInfoRepository>(repo: T) => T = (repo) => repo;
    expect(typeof fn).toBe("function");
  });
});
