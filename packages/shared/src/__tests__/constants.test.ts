import { describe, expect, it } from "vitest";

import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants";

describe("@sfx/shared constants", () => {
  it("exposes pagination defaults", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(MAX_PAGE_SIZE).toBe(100);
  });

  it("exposes the API version", () => {
    expect(API_VERSION).toBe("v1");
  });
});
