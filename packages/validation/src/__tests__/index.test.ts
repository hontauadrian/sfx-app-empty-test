import { describe, expect, it } from "vitest";

import * as validation from "../index";

describe("@sfx/validation barrel", () => {
  it("re-exports schemas and openapi helpers", () => {
    expect(typeof validation.zodToOpenApi).toBe("function");
    expect(typeof validation.getOpenApiSchemas).toBe("function");
    expect(validation.paginationSchema).toBeDefined();
    expect(validation.idParamSchema).toBeDefined();
    expect(validation.upsertCompanyInfoSchema).toBeDefined();
    expect(validation.companyInfoResponseSchema).toBeDefined();
    expect(validation.companyInfoVersionResponseSchema).toBeDefined();
    expect(validation.listCompanyInfoVersionsQuerySchema).toBeDefined();
    expect(validation.companyInfoVersionsPageSchema).toBeDefined();
    expect(typeof validation.upsertCompanyInfoSchema.parse).toBe("function");
    expect(typeof validation.companyInfoResponseSchema.parse).toBe("function");
    expect(typeof validation.companyInfoVersionResponseSchema.parse).toBe("function");
    expect(typeof validation.listCompanyInfoVersionsQuerySchema.parse).toBe("function");
    expect(typeof validation.companyInfoVersionsPageSchema.parse).toBe("function");
  });

  it("re-exports brand-guidelines-version schemas", () => {
    expect(validation.brandGuidelinesSnapshotSchema).toBeDefined();
    expect(validation.brandGuidelinesVersionResponseSchema).toBeDefined();
    expect(validation.listBrandGuidelinesVersionsQuerySchema).toBeDefined();
    expect(validation.brandGuidelinesVersionsPageSchema).toBeDefined();
    expect(validation.changeNoteQuerySchema).toBeDefined();
    expect(typeof validation.brandGuidelinesSnapshotSchema.parse).toBe("function");
    expect(typeof validation.brandGuidelinesVersionResponseSchema.parse).toBe("function");
    expect(typeof validation.listBrandGuidelinesVersionsQuerySchema.parse).toBe("function");
    expect(typeof validation.brandGuidelinesVersionsPageSchema.parse).toBe("function");
    expect(typeof validation.changeNoteQuerySchema.parse).toBe("function");
  });
});
