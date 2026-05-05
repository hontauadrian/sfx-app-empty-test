import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { LanguageProvider } from "../language-provider";
import { useTranslations } from "../use-translations";
import { common as enCommon } from "../languages/en/common";
import { common as roCommon } from "../languages/ro/common";

describe("useTranslations", () => {
  it("returns the active language's translations for the requested namespace", () => {
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LanguageProvider>{children}</LanguageProvider>;
    }
    const { result } = renderHook(() => useTranslations("common"), { wrapper });
    expect(result.current).toBe(enCommon);
  });

  it("returns translations for the explicit defaultLanguage", () => {
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LanguageProvider defaultLanguage="ro">{children}</LanguageProvider>;
    }
    const { result } = renderHook(() => useTranslations("common"), { wrapper });
    expect(result.current).toBe(roCommon);
  });

  it("throws when used outside a LanguageProvider", () => {
    expect(() => renderHook(() => useTranslations("common"))).toThrow(
      "useTranslations must be used within a LanguageProvider",
    );
  });
});
