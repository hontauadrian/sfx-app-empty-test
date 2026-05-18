import { describe, expect, it } from "vitest";

import * as domain from "../../index";
import type { BrandGuidelinesVersionRepository } from "../../ports/brand-guidelines-version-repository";
import type {
  BrandGuidelinesVersion,
  ListBrandGuidelinesVersionsInput,
  ListBrandGuidelinesVersionsResult,
} from "../../entities/brand-guidelines-version";

describe("BrandGuidelinesVersionRepository (port)", () => {
  it("is a type-only export with no runtime value on the barrel", () => {
    expect((domain as Record<string, unknown>).BrandGuidelinesVersionRepository).toBeUndefined();
  });

  it("type-checks a minimal in-memory stub implementation", async () => {
    const sample: BrandGuidelinesVersion = {
      id: "v-1",
      brandId: "brand-1",
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: "user-1",
      editorDisplayName: "Admin One",
      changeNote: null,
      createdAt: new Date(),
    };
    const stub: BrandGuidelinesVersionRepository = {
      list: async (
        _input: ListBrandGuidelinesVersionsInput,
      ): Promise<ListBrandGuidelinesVersionsResult> => ({ items: [sample], nextCursor: null }),
      findById: async (id: string): Promise<BrandGuidelinesVersion | null> =>
        id === sample.id ? sample : null,
      findLatestForBrand: async (brandId: string): Promise<BrandGuidelinesVersion | null> =>
        brandId === sample.brandId ? sample : null,
    };
    const page = await stub.list({ brandId: "brand-1", take: 50 });
    expect(page.items.length).toBe(1);
    expect(page.nextCursor).toBeNull();
    expect(await stub.findById("v-1")).toBe(sample);
    expect(await stub.findById("v-x")).toBeNull();
    expect(await stub.findLatestForBrand("brand-1")).toBe(sample);
    expect(await stub.findLatestForBrand("other")).toBeNull();
  });
});
