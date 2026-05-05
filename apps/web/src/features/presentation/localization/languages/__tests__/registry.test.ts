import { describe, expect, it } from "vitest";

import { LANGUAGE_DISPLAY_NAMES, translations } from "../registry";
import { common as enCommon } from "../en/common";
import { common as roCommon } from "../ro/common";

describe("language registry", () => {
  it("exposes a display name for every supported language code", () => {
    expect(LANGUAGE_DISPLAY_NAMES.en).toBe("English");
    expect(LANGUAGE_DISPLAY_NAMES.ro).toBe("Romana");
  });

  it("maps every language code to its translation namespaces", () => {
    expect(translations.en.common).toBe(enCommon);
    expect(translations.ro.common).toBe(roCommon);
  });
});
