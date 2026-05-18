import {
  companyInfoResponseSchema,
  companyInfoVersionResponseSchema,
  companyInfoVersionsPageSchema,
  listCompanyInfoVersionsQuerySchema,
  upsertCompanyInfoSchema,
} from '../company-info.schema';

const fullInput = {
  legalName: 'Acme Holdings SRL',
  tradingName: 'Acme',
  email: 'hello@acme.example',
  phone: '+40-21-555-0100',
  website: 'https://acme.example',
  addressLine1: '10 Strada Lipscani',
  addressLine2: 'Suite 4',
  city: 'Bucharest',
  postalCode: '030031',
  country: 'Romania',
  taxId: 'RO12345678',
  registrationNumber: 'J40/123/2020',
  companyName: 'Acme',
  foundedYear: 1998,
  teamSize: 42,
  industry: 'Manufacturing',
  missionStatement: 'M',
  visionStatement: 'V',
  coreValues: ['Integrity', 'Craft'],
  certifications: ['ISO 9001'],
};

describe('upsertCompanyInfoSchema — happy paths', () => {
  it('parses a minimal input with only legalName', () => {
    const result = upsertCompanyInfoSchema.safeParse({ legalName: 'Acme Holdings SRL' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legalName).toBe('Acme Holdings SRL');
      expect(result.data.tradingName).toBeUndefined();
    }
  });

  it('parses a full valid input and preserves every field', () => {
    const result = upsertCompanyInfoSchema.safeParse(fullInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(fullInput);
    }
  });

  it('preserves an explicit null on an optional field', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'Acme',
      tradingName: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tradingName).toBeNull();
    }
  });

  it("accepts website as empty string '' (explicit per spec)", () => {
    const result = upsertCompanyInfoSchema.safeParse({ legalName: 'Acme', website: '' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.website).toBe('');
    }
  });
});

describe('upsertCompanyInfoSchema — legalName (required, 1-200)', () => {
  it('rejects missing legalName and surfaces the field name in the issue path', () => {
    const result = upsertCompanyInfoSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('legalName');
    }
  });

  it('rejects an empty legalName', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: '' }).success).toBe(false);
  });

  it('accepts legalName length 1 (lower boundary)', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A' }).success).toBe(true);
  });

  it('accepts legalName length 200 (upper boundary)', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A'.repeat(200) }).success).toBe(true);
  });

  it('rejects legalName length 201 (above upper boundary)', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A'.repeat(201) }).success).toBe(false);
  });

  it('rejects a numeric legalName', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 42 }).success).toBe(false);
  });
});

describe('upsertCompanyInfoSchema — tradingName (optional, <=200)', () => {
  it('accepts length 200', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', tradingName: 'T'.repeat(200) }).success,
    ).toBe(true);
  });

  it('rejects length 201', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', tradingName: 'T'.repeat(201) }).success,
    ).toBe(false);
  });

  it('rejects a numeric tradingName', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', tradingName: 7 }).success,
    ).toBe(false);
  });
});

describe('upsertCompanyInfoSchema — email (optional, RFC)', () => {
  it('accepts a valid RFC email', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', email: 'user@example.com' }).success,
    ).toBe(true);
  });

  it('rejects a plainly invalid email and names the field in the path', () => {
    const result = upsertCompanyInfoSchema.safeParse({ legalName: 'A', email: 'not-an-email' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('email');
    }
  });

  it("rejects an empty-string email (callers should omit or send null)", () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A', email: '' }).success).toBe(false);
  });
});

describe('upsertCompanyInfoSchema — phone (optional, <=40)', () => {
  it('accepts length 40', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', phone: '1'.repeat(40) }).success,
    ).toBe(true);
  });

  it('rejects length 41', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', phone: '1'.repeat(41) }).success,
    ).toBe(false);
  });
});

describe('upsertCompanyInfoSchema — website (URL OR empty)', () => {
  it('accepts https://example.com', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', website: 'https://example.com' })
        .success,
    ).toBe(true);
  });

  it('rejects a bare hostname (no protocol)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', website: 'example.com' }).success,
    ).toBe(false);
  });

  it("accepts website as ''", () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', website: '' }).success,
    ).toBe(true);
  });

  it('rejects a non-URL non-empty website', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', website: 'not a url' }).success,
    ).toBe(false);
  });
});

describe('upsertCompanyInfoSchema — address group boundaries', () => {
  const atBoundary = {
    legalName: 'A',
    addressLine1: 'a'.repeat(200),
    addressLine2: 'b'.repeat(200),
    city: 'c'.repeat(100),
    postalCode: 'd'.repeat(40),
    country: 'e'.repeat(56),
  };

  it('accepts every address field at its upper boundary', () => {
    expect(upsertCompanyInfoSchema.safeParse(atBoundary).success).toBe(true);
  });

  for (const [field, max] of [
    ['addressLine1', 200],
    ['addressLine2', 200],
    ['city', 100],
    ['postalCode', 40],
    ['country', 56],
  ] as const) {
    it(`rejects ${field} at boundary+1 and names it in the issue path`, () => {
      const result = upsertCompanyInfoSchema.safeParse({
        ...atBoundary,
        [field]: 'x'.repeat(max + 1),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((issue) => issue.path.join('.'));
        expect(paths).toContain(field);
      }
    });
  }
});

describe('upsertCompanyInfoSchema — registration group boundaries', () => {
  it('accepts taxId and registrationNumber at length 64', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({
        legalName: 'A',
        taxId: 't'.repeat(64),
        registrationNumber: 'r'.repeat(64),
      }).success,
    ).toBe(true);
  });

  it('rejects taxId at length 65', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', taxId: 't'.repeat(65) }).success,
    ).toBe(false);
  });

  it('rejects registrationNumber at length 65', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({
        legalName: 'A',
        registrationNumber: 'r'.repeat(65),
      }).success,
    ).toBe(false);
  });
});

describe('upsertCompanyInfoSchema — strict / unknown-key rejection', () => {
  it('rejects a single unknown key with an unrecognized_keys issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({ legalName: 'Acme', notAField: 'value' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const codes = result.error.issues.map((issue) => issue.code);
      expect(codes).toContain('unrecognized_keys');
    }
  });

  it('rejects multiple unknown keys and names each one in the issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'Acme',
      foo: 1,
      bar: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const offending = result.error.issues
        .filter((issue) => issue.code === 'unrecognized_keys')
        .flatMap((issue) => (issue as { keys: string[] }).keys ?? []);
      expect(offending).toEqual(expect.arrayContaining(['foo', 'bar']));
    }
  });

  // Parking spot for any future cross-field invariant.
  it.skip('reserved for future cross-field constraints', () => {
    expect(true).toBe(true);
  });
});

describe('companyInfoResponseSchema', () => {
  const validResponse = {
    ...fullInput,
    id: 'clxyz1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('parses a fully-populated response', () => {
    const result = companyInfoResponseSchema.safeParse(validResponse);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('clxyz1234567890');
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it('rejects an empty id', () => {
    expect(companyInfoResponseSchema.safeParse({ ...validResponse, id: '' }).success).toBe(false);
  });

  it('rejects a missing id', () => {
    const withoutId = { ...validResponse } as Partial<typeof validResponse>;
    delete withoutId.id;
    expect(companyInfoResponseSchema.safeParse(withoutId).success).toBe(false);
  });

  it('rejects createdAt as a string', () => {
    expect(
      companyInfoResponseSchema.safeParse({ ...validResponse, createdAt: '2026-01-01' }).success,
    ).toBe(false);
  });

  it('accepts an optional field as null', () => {
    const result = companyInfoResponseSchema.safeParse({ ...validResponse, tradingName: null });
    expect(result.success).toBe(true);
  });

  it('accepts an optional field omitted', () => {
    const withoutTrading = { ...validResponse } as Partial<typeof validResponse>;
    delete withoutTrading.tradingName;
    const result = companyInfoResponseSchema.safeParse(withoutTrading);
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys (strict carried through extend)', () => {
    const result = companyInfoResponseSchema.safeParse({
      ...validResponse,
      extraneous: 'no',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const codes = result.error.issues.map((issue) => issue.code);
      expect(codes).toContain('unrecognized_keys');
    }
  });

  it('does not describe the {data: null} envelope (that lives in the controller DTO, not here)', () => {
    expect(companyInfoResponseSchema.safeParse({ data: null }).success).toBe(false);
  });

  it('parses a response with every new scalar and array populated', () => {
    const result = companyInfoResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyName).toBe('Acme');
      expect(result.data.foundedYear).toBe(1998);
      expect(result.data.teamSize).toBe(42);
      expect(result.data.industry).toBe('Manufacturing');
      expect(result.data.missionStatement).toBe('M');
      expect(result.data.visionStatement).toBe('V');
      expect(result.data.coreValues).toEqual(['Integrity', 'Craft']);
      expect(result.data.certifications).toEqual(['ISO 9001']);
    }
  });

  it('accepts coreValues: [] and certifications: []', () => {
    const result = companyInfoResponseSchema.safeParse({
      ...validResponse,
      coreValues: [],
      certifications: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects coreValues: null in a response (response shape mirrors the upsert shape)', () => {
    const result = companyInfoResponseSchema.safeParse({ ...validResponse, coreValues: null });
    expect(result.success).toBe(false);
  });
});

describe('upsertCompanyInfoSchema — companyName (optional, <=200)', () => {
  it('accepts length 200', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', companyName: 'c'.repeat(200) }).success,
    ).toBe(true);
  });

  it('rejects length 201', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', companyName: 'c'.repeat(201) }).success,
    ).toBe(false);
  });

  it('accepts null', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', companyName: null }).success,
    ).toBe(true);
  });

  it('accepts undefined', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A' }).success).toBe(true);
  });
});

describe('upsertCompanyInfoSchema — foundedYear (integer 1800-2027)', () => {
  it('accepts 1998', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: 1998 }).success,
    ).toBe(true);
  });

  it('accepts 1800 (lower boundary)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: 1800 }).success,
    ).toBe(true);
  });

  it('accepts 2027 (upper boundary)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: 2027 }).success,
    ).toBe(true);
  });

  it('rejects 1799 with a foundedYear path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: 1799 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('foundedYear');
    }
  });

  it('rejects 2028 with a foundedYear path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: 2028 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('foundedYear');
    }
  });

  it('rejects 1998.5 (non-integer)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: 1998.5 }).success,
    ).toBe(false);
  });

  it("rejects 'nineteen-ninety-eight' (string)", () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: 'nineteen-ninety-eight' })
        .success,
    ).toBe(false);
  });

  it('accepts null', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', foundedYear: null }).success,
    ).toBe(true);
  });
});

describe('upsertCompanyInfoSchema — teamSize (integer 0-1_000_000)', () => {
  it('accepts 0 (lower boundary)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', teamSize: 0 }).success,
    ).toBe(true);
  });

  it('accepts 1_000_000 (upper boundary)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', teamSize: 1_000_000 }).success,
    ).toBe(true);
  });

  it('rejects -1 with a teamSize path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({ legalName: 'A', teamSize: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('teamSize');
    }
  });

  it('rejects 1_000_001', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', teamSize: 1_000_001 }).success,
    ).toBe(false);
  });

  it('rejects 1.5 (non-integer)', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A', teamSize: 1.5 }).success).toBe(
      false,
    );
  });

  it('accepts null', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A', teamSize: null }).success).toBe(
      true,
    );
  });
});

describe('upsertCompanyInfoSchema — industry (optional, <=120)', () => {
  it('accepts length 120', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', industry: 'i'.repeat(120) }).success,
    ).toBe(true);
  });

  it('rejects length 121', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', industry: 'i'.repeat(121) }).success,
    ).toBe(false);
  });

  it('accepts null', () => {
    expect(upsertCompanyInfoSchema.safeParse({ legalName: 'A', industry: null }).success).toBe(
      true,
    );
  });
});

describe('upsertCompanyInfoSchema — missionStatement / visionStatement (optional, <=4000)', () => {
  for (const field of ['missionStatement', 'visionStatement'] as const) {
    it(`${field}: accepts length 4000`, () => {
      expect(
        upsertCompanyInfoSchema.safeParse({ legalName: 'A', [field]: 'm'.repeat(4000) }).success,
      ).toBe(true);
    });

    it(`${field}: rejects length 4001 and names the field in the issue path`, () => {
      const result = upsertCompanyInfoSchema.safeParse({
        legalName: 'A',
        [field]: 'm'.repeat(4001),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.path.join('.'))).toContain(field);
      }
    });

    it(`${field}: accepts null`, () => {
      expect(
        upsertCompanyInfoSchema.safeParse({ legalName: 'A', [field]: null }).success,
      ).toBe(true);
    });
  }
});

describe('upsertCompanyInfoSchema — coreValues (optional string[], <=32 items, each <=200)', () => {
  it('accepts an empty array (explicit clear)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', coreValues: [] }).success,
    ).toBe(true);
  });

  it('accepts a 32-item array', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({
        legalName: 'A',
        coreValues: Array.from({ length: 32 }, (_, i) => `v${i}`),
      }).success,
    ).toBe(true);
  });

  it('rejects a 33-item array with a coreValues path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'A',
      coreValues: Array.from({ length: 33 }, (_, i) => `v${i}`),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.').startsWith('coreValues')),
      ).toBe(true);
    }
  });

  it('rejects an array containing a 201-char item with a coreValues.<idx> path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'A',
      coreValues: ['ok', 'x'.repeat(201)],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.').startsWith('coreValues')),
      ).toBe(true);
    }
  });

  it('rejects an array containing an empty-string item with a coreValues.<idx> path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'A',
      coreValues: ['ok', ''],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.').startsWith('coreValues')),
      ).toBe(true);
    }
  });

  it('rejects null (arrays are .optional(), not .nullish())', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', coreValues: null }).success,
    ).toBe(false);
  });

  it('rejects an array containing a non-string element with a coreValues.<idx> path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'A',
      coreValues: ['ok', 12345],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.').startsWith('coreValues')),
      ).toBe(true);
    }
  });
});

describe('upsertCompanyInfoSchema — certifications (optional string[], <=32 items, each <=200)', () => {
  it('accepts an empty array (explicit clear)', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', certifications: [] }).success,
    ).toBe(true);
  });

  it('accepts a 32-item array', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({
        legalName: 'A',
        certifications: Array.from({ length: 32 }, (_, i) => `c${i}`),
      }).success,
    ).toBe(true);
  });

  it('rejects a 33-item array with a certifications path issue', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'A',
      certifications: Array.from({ length: 33 }, (_, i) => `c${i}`),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.').startsWith('certifications')),
      ).toBe(true);
    }
  });

  it('rejects an array containing a 201-char item', () => {
    const result = upsertCompanyInfoSchema.safeParse({
      legalName: 'A',
      certifications: ['ok', 'x'.repeat(201)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an array containing an empty-string item', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', certifications: ['ok', ''] }).success,
    ).toBe(false);
  });

  it('rejects null', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', certifications: null }).success,
    ).toBe(false);
  });

  it('rejects an array containing a non-string element', () => {
    expect(
      upsertCompanyInfoSchema.safeParse({ legalName: 'A', certifications: ['ok', 12345] }).success,
    ).toBe(false);
  });
});

describe('companyInfoVersionResponseSchema', () => {
  const validSnapshot = {
    ...fullInput,
    id: 'clxyz1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
  const validVersion = {
    id: 'clxyzversion0000000001',
    companyInfoId: 'clxyz1234567890',
    snapshot: validSnapshot,
    editorUserId: 'auth-user-abc',
    editorDisplayName: 'admin@example.com',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  };

  it('parses a fully-populated version', () => {
    const result = companyInfoVersionResponseSchema.safeParse(validVersion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('clxyzversion0000000001');
      expect(result.data.snapshot.legalName).toBe(validSnapshot.legalName);
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it('rejects when snapshot is missing', () => {
    const withoutSnapshot = { ...validVersion } as Partial<typeof validVersion>;
    delete withoutSnapshot.snapshot;
    expect(companyInfoVersionResponseSchema.safeParse(withoutSnapshot).success).toBe(false);
  });

  it('rejects when snapshot.legalName is missing (delegates to nested schema)', () => {
    const broken = {
      ...validVersion,
      snapshot: { ...validSnapshot, legalName: undefined as unknown as string },
    };
    expect(companyInfoVersionResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects empty editorUserId', () => {
    expect(
      companyInfoVersionResponseSchema.safeParse({ ...validVersion, editorUserId: '' }).success,
    ).toBe(false);
  });

  it('rejects empty editorDisplayName', () => {
    expect(
      companyInfoVersionResponseSchema.safeParse({ ...validVersion, editorDisplayName: '' })
        .success,
    ).toBe(false);
  });

  it('rejects createdAt as a string', () => {
    expect(
      companyInfoVersionResponseSchema.safeParse({
        ...validVersion,
        createdAt: '2026-02-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    const result = companyInfoVersionResponseSchema.safeParse({ ...validVersion, extra: 'no' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.code)).toContain('unrecognized_keys');
    }
  });
});

describe('listCompanyInfoVersionsQuerySchema', () => {
  it('accepts an empty object (every field optional)', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts take: 1 (lower boundary)', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ take: 1 }).success).toBe(true);
  });

  it('accepts take: 100 (upper boundary)', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ take: 100 }).success).toBe(true);
  });

  it("coerces take: '25' (string) → 25 (number)", () => {
    const result = listCompanyInfoVersionsQuerySchema.safeParse({ take: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.take).toBe(25);
    }
  });

  it('rejects take: 0', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ take: 0 }).success).toBe(false);
  });

  it('rejects take: 101', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ take: 101 }).success).toBe(false);
  });

  it('rejects take: 50.5 (non-integer)', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ take: 50.5 }).success).toBe(false);
  });

  it("rejects take: 'fifty' (non-numeric string)", () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ take: 'fifty' }).success).toBe(false);
  });

  it('accepts cursor: "abc"', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(true);
  });

  it('rejects cursor: "" (empty)', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(listCompanyInfoVersionsQuerySchema.safeParse({ foo: 'bar' }).success).toBe(false);
  });
});

describe('companyInfoVersionsPageSchema', () => {
  const validSnapshot = {
    ...fullInput,
    id: 'clxyz1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
  const validVersion = {
    id: 'clxyzversion0000000001',
    companyInfoId: 'clxyz1234567890',
    snapshot: validSnapshot,
    editorUserId: 'auth-user-abc',
    editorDisplayName: 'admin@example.com',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  };

  it('accepts an empty page', () => {
    const result = companyInfoVersionsPageSchema.safeParse({ items: [], nextCursor: null });
    expect(result.success).toBe(true);
  });

  it('accepts a populated page with a non-null nextCursor', () => {
    const result = companyInfoVersionsPageSchema.safeParse({
      items: [validVersion],
      nextCursor: 'next-id',
    });
    expect(result.success).toBe(true);
  });

  it('rejects incomplete items (missing version fields)', () => {
    const incomplete = { id: 'v1', companyInfoId: 'c' };
    const result = companyInfoVersionsPageSchema.safeParse({
      items: [incomplete],
      nextCursor: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects nextCursor: ""', () => {
    expect(
      companyInfoVersionsPageSchema.safeParse({ items: [], nextCursor: '' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      companyInfoVersionsPageSchema.safeParse({ items: [], nextCursor: null, extra: 1 }).success,
    ).toBe(false);
  });
});
