import { describe, expect, it } from "vitest";

import * as domain from "../index";
// Type-only imports validate the barrel exposes these symbols at the
// type layer. They have no runtime keys because the barrel re-exports
// them via `export type`, which is erased.
import type {
  CompanyInfo,
  CompanyInfoRepository,
  UpsertCompanyInfoInput,
} from "../index";

describe("@sfx/domain barrel", () => {
  it("exposes the Chunk C runtime constants for category enumeration", () => {
    expect(domain).toBeDefined();
    expect(Object.keys(domain).sort()).toEqual([
      "DOS_DONTS_CATEGORIES",
      "DOS_DONTS_TYPES",
      "GUIDELINE_SEARCH_SECTIONS",
    ]);
    expect(domain.DOS_DONTS_TYPES).toEqual(["do", "dont"]);
    expect(domain.DOS_DONTS_CATEGORIES).toContain("tone");
    expect(domain.GUIDELINE_SEARCH_SECTIONS).toContain("dos-and-donts");
  });

  it("re-exports CompanyInfo / CompanyInfoRepository / UpsertCompanyInfoInput as type names", () => {
    const sample: CompanyInfo = {
      id: "id-1",
      legalName: "Acme",
      tradingName: null,
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      taxId: null,
      registrationNumber: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const input: UpsertCompanyInfoInput = { legalName: "Acme" };

    const repo: CompanyInfoRepository = {
      async findSingleton() {
        return sample;
      },
      async upsertSingleton() {
        return sample;
      },
    };

    expect(sample.legalName).toBe("Acme");
    expect(input.legalName).toBe("Acme");
    expect(typeof repo.findSingleton).toBe("function");
  });
});
