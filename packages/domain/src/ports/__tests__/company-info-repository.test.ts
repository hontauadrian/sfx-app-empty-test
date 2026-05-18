import { describe, expect, it } from "vitest";

import * as domain from "../../index";
import type { CompanyInfo, UpsertCompanyInfoInput } from "../../entities/company-info";
import type {
  CompanyInfoVersion,
  ListCompanyInfoVersionsInput,
  ListCompanyInfoVersionsResult,
} from "../../entities/company-info-version";
import type {
  CompanyInfoEditor,
  CompanyInfoRepository,
} from "../../ports/company-info-repository";

const buildRecord = (overrides: Partial<CompanyInfo> = {}): CompanyInfo => ({
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
  companyName: null,
  foundedYear: null,
  teamSize: null,
  industry: null,
  missionStatement: null,
  visionStatement: null,
  coreValues: [],
  certifications: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildVersion = (overrides: Partial<CompanyInfoVersion> = {}): CompanyInfoVersion => ({
  id: "v-1",
  companyInfoId: "id-1",
  snapshot: buildRecord(),
  editorUserId: "subject-admin",
  editorDisplayName: "admin@example.test",
  createdAt: new Date(),
  ...overrides,
});

describe("CompanyInfoRepository", () => {
  it("is a type-only export with no runtime value on the barrel", () => {
    expect((domain as Record<string, unknown>).CompanyInfoRepository).toBeUndefined();
  });

  it("is satisfied by an object exposing every required method", () => {
    const repo: CompanyInfoRepository = {
      async findSingleton() {
        return buildRecord();
      },
      async upsertSingleton(_input: UpsertCompanyInfoInput, _editor: CompanyInfoEditor) {
        return buildRecord();
      },
      async listVersions(_input: ListCompanyInfoVersionsInput): Promise<ListCompanyInfoVersionsResult> {
        return { items: [], nextCursor: null };
      },
      async findVersionById(_id: string) {
        return buildVersion();
      },
    };

    expect(typeof repo.findSingleton).toBe("function");
    expect(typeof repo.upsertSingleton).toBe("function");
    expect(typeof repo.listVersions).toBe("function");
    expect(typeof repo.findVersionById).toBe("function");
  });

  it("rejects an implementation missing upsertSingleton at typecheck", () => {
    // @ts-expect-error — missing `upsertSingleton` must be a compile error.
    const partial: CompanyInfoRepository = {
      async findSingleton() {
        return null;
      },
      async listVersions() {
        return { items: [], nextCursor: null };
      },
      async findVersionById() {
        return null;
      },
    };

    expect(partial.findSingleton).toBeDefined();
  });

  it("rejects an implementation missing listVersions at typecheck", () => {
    // @ts-expect-error — missing `listVersions` must be a compile error.
    const partial: CompanyInfoRepository = {
      async findSingleton() {
        return null;
      },
      async upsertSingleton(_input: UpsertCompanyInfoInput, _editor: CompanyInfoEditor) {
        return buildRecord();
      },
      async findVersionById() {
        return null;
      },
    };

    expect(partial.findSingleton).toBeDefined();
  });

  it("rejects an implementation missing findVersionById at typecheck", () => {
    // @ts-expect-error — missing `findVersionById` must be a compile error.
    const partial: CompanyInfoRepository = {
      async findSingleton() {
        return null;
      },
      async upsertSingleton(_input: UpsertCompanyInfoInput, _editor: CompanyInfoEditor) {
        return buildRecord();
      },
      async listVersions() {
        return { items: [], nextCursor: null };
      },
    };

    expect(partial.findSingleton).toBeDefined();
  });

  it("rejects upsertSingleton called without editor at typecheck", async () => {
    const repo: CompanyInfoRepository = {
      async findSingleton() {
        return null;
      },
      async upsertSingleton(_input, _editor) {
        return buildRecord();
      },
      async listVersions() {
        return { items: [], nextCursor: null };
      },
      async findVersionById() {
        return null;
      },
    };
    // @ts-expect-error — second arg `editor` is required.
    await repo.upsertSingleton({ legalName: "Acme" });
  });

  it("accepts a minimal UpsertCompanyInfoInput (legalName only)", () => {
    const minimal: UpsertCompanyInfoInput = { legalName: "Acme" };
    expect(minimal.legalName).toBe("Acme");
  });

  it("accepts an UpsertCompanyInfoInput with every optional field as null", () => {
    const full: UpsertCompanyInfoInput = {
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
      companyName: null,
      foundedYear: null,
      teamSize: null,
      industry: null,
      missionStatement: null,
      visionStatement: null,
    };

    expect(full.email).toBeNull();
  });

  it("CompanyInfoEditor accepts the documented shape", () => {
    const editor: CompanyInfoEditor = {
      editorUserId: "subject-abc",
      editorDisplayName: "admin@example.test",
    };
    expect(editor.editorUserId).toBe("subject-abc");
  });
});
