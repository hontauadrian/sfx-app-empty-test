import { describe, expect, it } from "vitest";

import * as shared from "../index";

describe("@sfx/shared barrel", () => {
  it("re-exports enums, types, helpers, and constants", () => {
    expect(shared.HttpStatus).toBeDefined();
    expect(shared.ErrorCode).toBeDefined();
    expect(typeof shared.createSuccessResponse).toBe("function");
    expect(typeof shared.createErrorResponse).toBe("function");
    expect(shared.DEFAULT_PAGE_SIZE).toBe(20);
    expect(shared.MAX_PAGE_SIZE).toBe(100);
    expect(shared.API_VERSION).toBe("v1");
  });
});
