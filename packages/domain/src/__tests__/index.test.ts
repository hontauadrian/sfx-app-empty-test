import { describe, expect, it } from "vitest";

import * as domain from "../index";

describe("@sfx/domain barrel", () => {
  it("loads as an empty scaffold module", () => {
    expect(domain).toBeDefined();
    expect(Object.keys(domain)).toEqual([]);
  });
});
