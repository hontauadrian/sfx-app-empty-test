import { describe, expect, it } from "vitest";

import * as domain from "../index";

describe("@sfx/domain barrel", () => {
  it("exports the BrandProfile repository token as a symbol", () => {
    expect(domain).toBeDefined();
    expect(domain.BRAND_PROFILE_REPOSITORY).toBeDefined();
    expect(typeof domain.BRAND_PROFILE_REPOSITORY).toBe("symbol");
  });
});
