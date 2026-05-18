import { describe, expect, it } from "vitest";

import { LANGUAGE_DISPLAY_NAMES, translations } from "../registry";
import { common as enCommon } from "../en/common";
import { common as roCommon } from "../ro/common";

const UPSERT_FIELDS = [
  "legalName",
  "tradingName",
  "email",
  "phone",
  "website",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
  "country",
  "taxId",
  "registrationNumber",
  "companyName",
  "industry",
  "foundedYear",
  "teamSize",
  "missionStatement",
  "visionStatement",
  "coreValues",
  "certifications",
] as const;

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  const paths: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix === "" ? key : `${prefix}.${key}`;
    paths.push(...collectKeyPaths(nested, next));
  }
  return paths.sort();
}

describe("language registry", () => {
  it("exposes a display name for every supported language code", () => {
    expect(LANGUAGE_DISPLAY_NAMES.en).toBe("English");
    expect(LANGUAGE_DISPLAY_NAMES.ro).toBe("Romana");
  });

  it("maps every language code to its translation namespaces", () => {
    expect(translations.en.common).toBe(enCommon);
    expect(translations.ro.common).toBe(roCommon);
  });

  it("provides the en nav and admin sub-objects", () => {
    expect(enCommon.nav.home).toBe("Home");
    expect(enCommon.nav.admin).toBe("Admin");
    expect(enCommon.admin.landing.title).toBe("Administration");
    expect(enCommon.admin.subnav.companyInfo).toBe("Company Info");
    expect(enCommon.admin.denied.title).toBe("Access denied");
    expect(enCommon.admin.denied.message.length).toBeGreaterThan(0);
    expect(enCommon.admin.denied.backToHome).toBe("Back to Home");
  });

  it("provides the ro nav and admin sub-objects", () => {
    expect(roCommon.nav.home).toBe("Acasa");
    expect(roCommon.nav.admin).toBe("Administrare");
    expect(roCommon.admin.landing.title).toBe("Administrare");
    expect(roCommon.admin.subnav.companyInfo.length).toBeGreaterThan(0);
    expect(roCommon.admin.denied.title.length).toBeGreaterThan(0);
    expect(roCommon.admin.denied.message.length).toBeGreaterThan(0);
    expect(roCommon.admin.denied.backToHome.length).toBeGreaterThan(0);
  });

  it("exposes non-empty adminCompanyInfo copy for en", () => {
    expect(enCommon.adminCompanyInfo.pageTitle).toBe("Company Info");
    expect(enCommon.adminCompanyInfo.sections.legalRegistration).toBe("Legal & Registration");
    expect(enCommon.adminCompanyInfo.sections.identity).toBe("Identity");
    expect(enCommon.adminCompanyInfo.sections.keyFacts).toBe("Key Facts");
    expect(enCommon.adminCompanyInfo.sections.contact).toBe("Contact");
    expect(enCommon.adminCompanyInfo.cta.create).toBe("Create company info");
    expect(enCommon.adminCompanyInfo.cta.save).toBe("Save changes");
    expect(enCommon.adminCompanyInfo.cta.saving.length).toBeGreaterThan(0);
    expect(enCommon.adminCompanyInfo.cta.addCoreValue.length).toBeGreaterThan(0);
    expect(enCommon.adminCompanyInfo.cta.addCertification.length).toBeGreaterThan(0);
    expect(enCommon.adminCompanyInfo.cta.removeCoreValue.length).toBeGreaterThan(0);
    expect(enCommon.adminCompanyInfo.cta.removeCertification.length).toBeGreaterThan(0);
    expect(enCommon.adminCompanyInfo.toast.success).toBe("Company info saved");
    expect(enCommon.adminCompanyInfo.toast.unexpectedError.length).toBeGreaterThan(0);
    expect(enCommon.adminCompanyInfo.toast.authError.length).toBeGreaterThan(0);
    for (const field of UPSERT_FIELDS) {
      expect(enCommon.adminCompanyInfo.fields[field].label.length).toBeGreaterThan(0);
      expect(enCommon.adminCompanyInfo.fields[field].placeholder.length).toBeGreaterThan(0);
      expect(enCommon.adminCompanyInfo.validation[field].length).toBeGreaterThan(0);
    }
  });

  it("exposes non-empty adminCompanyInfo copy for ro", () => {
    expect(roCommon.adminCompanyInfo.pageTitle.length).toBeGreaterThan(0);
    expect(roCommon.adminCompanyInfo.sections.identity.length).toBeGreaterThan(0);
    expect(roCommon.adminCompanyInfo.cta.create.length).toBeGreaterThan(0);
    expect(roCommon.adminCompanyInfo.cta.save.length).toBeGreaterThan(0);
    expect(roCommon.adminCompanyInfo.cta.saving.length).toBeGreaterThan(0);
    expect(roCommon.adminCompanyInfo.toast.success.length).toBeGreaterThan(0);
    for (const field of UPSERT_FIELDS) {
      expect(roCommon.adminCompanyInfo.fields[field].label.length).toBeGreaterThan(0);
      expect(roCommon.adminCompanyInfo.fields[field].placeholder.length).toBeGreaterThan(0);
      expect(roCommon.adminCompanyInfo.validation[field].length).toBeGreaterThan(0);
    }
  });

  it("ro adminCompanyInfo copy contains no diacritics", () => {
    const serialized = JSON.stringify(roCommon.adminCompanyInfo);
    expect(serialized).not.toMatch(/[ăâîșțĂÂÎȘȚşţŞŢ]/);
  });

  it("keeps key parity across en and ro translations including nested sub-objects", () => {
    expect(collectKeyPaths(enCommon)).toEqual(collectKeyPaths(roCommon));
  });
});
