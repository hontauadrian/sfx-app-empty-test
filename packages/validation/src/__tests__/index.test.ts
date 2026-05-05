import { describe, expect, it } from "vitest";

import * as validation from "../index";

describe("@sfx/validation barrel", () => {
  it("re-exports schemas and openapi helpers", () => {
    expect(typeof validation.zodToOpenApi).toBe("function");
    expect(typeof validation.getOpenApiSchemas).toBe("function");
    expect(validation.paginationSchema).toBeDefined();
    expect(validation.idParamSchema).toBeDefined();
  });
});
