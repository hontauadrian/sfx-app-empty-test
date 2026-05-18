import { describe, expect, it } from "vitest";

import * as domain from "../../index";
import type {
  BrandGuidelinesVersion,
  BrandGuidelinesSnapshot,
  ListBrandGuidelinesVersionsInput,
  ListBrandGuidelinesVersionsResult,
} from "../../entities/brand-guidelines-version";

describe("BrandGuidelinesVersion", () => {
  it("is a type-only export with no runtime value on the barrel", () => {
    expect((domain as Record<string, unknown>).BrandGuidelinesVersion).toBeUndefined();
    expect((domain as Record<string, unknown>).BrandGuidelinesSnapshot).toBeUndefined();
  });

  it("compiles a populated snapshot with all four sub-resources", () => {
    const snapshot: BrandGuidelinesSnapshot = {
      voice: {
        brandId: "brand-1",
        tone: "Friendly",
        preferredVocabulary: ["craft"],
        restrictedVocabulary: ["forbidden"],
        messagingPillars: [],
        writingStyleRules: "",
        audienceRules: [],
        approvedExamples: [],
        rejectedExamples: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      visual: {
        brandId: "brand-1",
        logoUsage: "Use the primary mark",
        colorPalette: [],
        typography: [],
        spacingGuidance: "",
        imageStyleGuidance: "",
        iconographyGuidance: "",
        usageRestrictions: "",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      dosAndDonts: [
        {
          id: "dd-1",
          brandId: "brand-1",
          type: "do",
          category: "tone",
          ruleText: "Be concise",
          exampleText: null,
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        },
      ],
      metadata: {
        brandId: "brand-1",
        ownerUserId: "user-1",
        lastUpdatedAt: new Date("2026-01-02T00:00:00.000Z"),
        lastUpdatedByUserId: "user-1",
        tags: ["launch"],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    };

    const version: BrandGuidelinesVersion = {
      id: "v-1",
      brandId: "brand-1",
      snapshot,
      editorUserId: "user-1",
      editorDisplayName: "Admin One",
      changeNote: "first save",
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    };

    expect(version.snapshot.voice).not.toBeNull();
    expect(version.snapshot.dosAndDonts.length).toBe(1);
    expect(version.changeNote).toBe("first save");
    expect(version.createdAt).toBeInstanceOf(Date);
  });

  it("permits null sub-resources and null changeNote", () => {
    const version: BrandGuidelinesVersion = {
      id: "v-2",
      brandId: "brand-1",
      snapshot: {
        voice: null,
        visual: null,
        dosAndDonts: [],
        metadata: null,
      },
      editorUserId: "user-2",
      editorDisplayName: "Admin Two",
      changeNote: null,
      createdAt: new Date(),
    };

    expect(version.snapshot.voice).toBeNull();
    expect(version.snapshot.dosAndDonts.length).toBe(0);
    expect(version.changeNote).toBeNull();
  });

  it("ListBrandGuidelinesVersionsInput accepts cursor + take", () => {
    const input: ListBrandGuidelinesVersionsInput = {
      brandId: "brand-1",
      take: 25,
      cursor: "v-1",
    };
    expect(input.take).toBe(25);
    expect(input.cursor).toBe("v-1");
  });

  it("ListBrandGuidelinesVersionsInput cursor is optional", () => {
    const input: ListBrandGuidelinesVersionsInput = { brandId: "brand-1", take: 50 };
    expect(input.cursor).toBeUndefined();
  });

  it("ListBrandGuidelinesVersionsResult holds items + nextCursor null", () => {
    const result: ListBrandGuidelinesVersionsResult = { items: [], nextCursor: null };
    expect(result.items.length).toBe(0);
    expect(result.nextCursor).toBeNull();
  });

  it("type-only check: TS rejects null for dosAndDonts array", () => {
    const snapshot: BrandGuidelinesSnapshot = {
      voice: null,
      visual: null,
      // @ts-expect-error readonly DosDontsEntry[] cannot be null
      dosAndDonts: null,
      metadata: null,
    };
    expect(snapshot.dosAndDonts).toBeNull();
  });
});
