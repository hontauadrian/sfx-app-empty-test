import { describe, expect, it } from "vitest";

import * as domain from "../../index";
import type { CompanyInfo } from "../../entities/company-info";

describe("CompanyInfo", () => {
  it("is a type-only export with no runtime value on the barrel", () => {
    expect((domain as Record<string, unknown>).CompanyInfo).toBeUndefined();
  });

  it("compiles with the full required + optional field set", () => {
    // Sample literal — if the interface drifts, typecheck fails CI.
    const sample: CompanyInfo = {
      id: "clxyz1234567890",
      legalName: "Acme Holdings SRL",
      tradingName: "Acme",
      email: "hello@acme.example",
      phone: "+40-21-555-0100",
      website: "https://acme.example",
      addressLine1: "10 Strada Lipscani",
      addressLine2: "Suite 4",
      city: "Bucharest",
      postalCode: "030031",
      country: "Romania",
      taxId: "RO12345678",
      registrationNumber: "J40/123/2020",
      companyName: "Acme",
      foundedYear: 1998,
      teamSize: 42,
      industry: "Manufacturing",
      missionStatement: "M",
      visionStatement: "V",
      coreValues: ["Integrity", "Craft"],
      certifications: ["ISO 9001"],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };

    expect(sample.legalName).toBe("Acme Holdings SRL");
    expect(sample.createdAt).toBeInstanceOf(Date);
  });

  it("permits optional fields as null (explicit clear)", () => {
    const sample: CompanyInfo = {
      id: "id-1",
      legalName: "Bare Co",
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
    };

    expect(sample.tradingName).toBeNull();
  });

  it("compiles with the expanded scalar + array field set", () => {
    const sample: CompanyInfo = {
      id: "id-2",
      legalName: "Expanded Co",
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
      companyName: "Acme Display",
      foundedYear: 1998,
      teamSize: 42,
      industry: "Manufacturing",
      missionStatement: "M",
      visionStatement: "V",
      coreValues: ["Integrity", "Craft"],
      certifications: ["ISO 9001"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(sample.companyName).toBe("Acme Display");
    expect(sample.foundedYear).toBe(1998);
    expect(sample.teamSize).toBe(42);
    expect(sample.industry).toBe("Manufacturing");
    expect(sample.missionStatement).toBe("M");
    expect(sample.visionStatement).toBe("V");
    expect(sample.coreValues).toEqual(["Integrity", "Craft"]);
    expect(sample.certifications).toEqual(["ISO 9001"]);
  });

  it("permits scalar optionals as null while arrays default to empty", () => {
    const sample: CompanyInfo = {
      id: "id-3",
      legalName: "Bare Co",
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
    };

    expect(sample.companyName).toBeNull();
    expect(sample.foundedYear).toBeNull();
    expect(sample.teamSize).toBeNull();
    expect(sample.industry).toBeNull();
    expect(sample.missionStatement).toBeNull();
    expect(sample.visionStatement).toBeNull();
    expect(sample.coreValues.length).toBe(0);
    expect(sample.certifications.length).toBe(0);
  });

  it("type-only check: TS rejects null for an array field", () => {
    const sample: CompanyInfo = {
      id: "id-4",
      legalName: "Co",
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
      // @ts-expect-error null is not assignable to readonly string[]
      coreValues: null,
      certifications: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(sample.coreValues).toBeNull();
  });
});
