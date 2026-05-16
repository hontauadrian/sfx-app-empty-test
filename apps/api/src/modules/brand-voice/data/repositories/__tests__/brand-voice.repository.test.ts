import { describe, expect, it, vi, beforeEach } from 'vitest';
import type {
  BrandProfile,
  BrandProfileCreateInput,
  BrandProfileUpdatePatch,
  BrandVoiceUpsertInput,
  IBrandProfileRepository,
} from '@sfx/domain';
import { BrandVoiceRepository } from '../brand-voice.repository';

class InMemoryBrandProfileRepository implements IBrandProfileRepository {
  private readonly brands = new Map<string, BrandProfile>();
  async listByOwner(ownerSubject: string): Promise<BrandProfile[]> {
    return Array.from(this.brands.values()).filter(
      (entry) => entry.ownerSubject === ownerSubject,
    );
  }
  async findById(id: string, ownerSubject: string): Promise<BrandProfile | null> {
    const entry = this.brands.get(id);
    if (!entry || entry.ownerSubject !== ownerSubject) return null;
    return entry;
  }
  async create(input: BrandProfileCreateInput): Promise<BrandProfile> {
    const id = `brand-${this.brands.size + 1}`;
    const now = new Date('2026-05-15T00:00:00.000Z');
    const brand: BrandProfile = {
      id,
      ownerSubject: input.ownerSubject,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    this.brands.set(id, brand);
    return brand;
  }
  async update(
    _id: string,
    _ownerSubject: string,
    _patch: BrandProfileUpdatePatch,
  ): Promise<BrandProfile | null> {
    return null;
  }
  async delete(id: string, ownerSubject: string): Promise<boolean> {
    const entry = this.brands.get(id);
    if (!entry || entry.ownerSubject !== ownerSubject) return false;
    this.brands.delete(id);
    return true;
  }
  seed(brand: BrandProfile): void {
    this.brands.set(brand.id, brand);
  }
}

const emptyPayload: BrandVoiceUpsertInput = {
  toneOfVoice: null,
  preferredVocabulary: [],
  restrictedVocabulary: [],
  messagingPillars: [],
  writingStyleRules: [],
  audienceRules: [],
  approvedExamplePhrases: [],
  rejectedExamplePhrases: [],
};

describe('BrandVoiceRepository', () => {
  let brandRepo: InMemoryBrandProfileRepository;
  let prisma: {
    brandVoice: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
  let voiceRepo: BrandVoiceRepository;

  beforeEach(() => {
    brandRepo = new InMemoryBrandProfileRepository();
    brandRepo.seed({
      id: 'brand-1',
      ownerSubject: 'admin',
      name: 'Acme',
      description: null,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    });
    prisma = {
      brandVoice: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };
    voiceRepo = new BrandVoiceRepository(
      prisma as unknown as ConstructorParameters<typeof BrandVoiceRepository>[0],
      brandRepo,
    );
  });

  describe('findByBrand', () => {
    it('returns null when brand is not owned (cross-tenant)', async () => {
      const result = await voiceRepo.findByBrand('brand-1', 'viewer');
      expect(result).toBeNull();
      expect(prisma.brandVoice.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when brand does not exist', async () => {
      const result = await voiceRepo.findByBrand('missing', 'admin');
      expect(result).toBeNull();
      expect(prisma.brandVoice.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when no voice row exists yet for owned brand', async () => {
      prisma.brandVoice.findUnique.mockResolvedValue(null);
      const result = await voiceRepo.findByBrand('brand-1', 'admin');
      expect(result).toBeNull();
      expect(prisma.brandVoice.findUnique).toHaveBeenCalledWith({
        where: { brandProfileId: 'brand-1' },
      });
    });

    it('maps a found row to the domain shape', async () => {
      const now = new Date('2026-05-15T01:00:00.000Z');
      prisma.brandVoice.findUnique.mockResolvedValue({
        id: 'v-1',
        brandProfileId: 'brand-1',
        toneOfVoice: 'Warm',
        preferredVocabulary: ['craft'],
        restrictedVocabulary: [],
        messagingPillars: ['Trust'],
        writingStyleRules: [],
        audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
        approvedExamplePhrases: [],
        rejectedExamplePhrases: [],
        createdAt: now,
        updatedAt: now,
      });
      const result = await voiceRepo.findByBrand('brand-1', 'admin');
      expect(result).toEqual({
        id: 'v-1',
        brandProfileId: 'brand-1',
        toneOfVoice: 'Warm',
        preferredVocabulary: ['craft'],
        restrictedVocabulary: [],
        messagingPillars: ['Trust'],
        writingStyleRules: [],
        audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
        approvedExamplePhrases: [],
        rejectedExamplePhrases: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    it('drops malformed json entries on read', async () => {
      const now = new Date('2026-05-15T01:00:00.000Z');
      prisma.brandVoice.findUnique.mockResolvedValue({
        id: 'v-2',
        brandProfileId: 'brand-1',
        toneOfVoice: null,
        preferredVocabulary: ['ok', 42, null],
        restrictedVocabulary: 'not-array',
        messagingPillars: [{ unexpected: true }],
        writingStyleRules: [],
        audienceRules: [{ audience: 'a' }, { audience: 'b', rule: 'r' }, 'bad'],
        approvedExamplePhrases: [],
        rejectedExamplePhrases: [],
        createdAt: now,
        updatedAt: now,
      });
      const result = await voiceRepo.findByBrand('brand-1', 'admin');
      expect(result?.preferredVocabulary).toEqual(['ok']);
      expect(result?.restrictedVocabulary).toEqual([]);
      expect(result?.messagingPillars).toEqual([]);
      expect(result?.audienceRules).toEqual([{ audience: 'b', rule: 'r' }]);
    });
  });

  describe('upsertForBrand', () => {
    it('returns null without calling prisma when brand is not owned', async () => {
      const result = await voiceRepo.upsertForBrand('brand-1', 'viewer', emptyPayload);
      expect(result).toBeNull();
      expect(prisma.brandVoice.upsert).not.toHaveBeenCalled();
    });

    it('returns null without calling prisma when brand is missing', async () => {
      const result = await voiceRepo.upsertForBrand('missing', 'admin', emptyPayload);
      expect(result).toBeNull();
      expect(prisma.brandVoice.upsert).not.toHaveBeenCalled();
    });

    it('upserts a fully populated payload and maps the row', async () => {
      const now = new Date('2026-05-15T01:00:00.000Z');
      const populated: BrandVoiceUpsertInput = {
        toneOfVoice: 'Warm.',
        preferredVocabulary: ['craft'],
        restrictedVocabulary: ['utilize'],
        messagingPillars: ['Trust'],
        writingStyleRules: ['Use active voice.'],
        audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
        approvedExamplePhrases: ['Hi'],
        rejectedExamplePhrases: ['Hey'],
      };
      prisma.brandVoice.upsert.mockResolvedValue({
        id: 'v-3',
        brandProfileId: 'brand-1',
        toneOfVoice: 'Warm.',
        preferredVocabulary: ['craft'],
        restrictedVocabulary: ['utilize'],
        messagingPillars: ['Trust'],
        writingStyleRules: ['Use active voice.'],
        audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
        approvedExamplePhrases: ['Hi'],
        rejectedExamplePhrases: ['Hey'],
        createdAt: now,
        updatedAt: now,
      });
      const result = await voiceRepo.upsertForBrand('brand-1', 'admin', populated);
      expect(result?.toneOfVoice).toBe('Warm.');
      expect(result?.audienceRules).toEqual([
        { audience: 'Gen Z', rule: 'Peer-to-peer.' },
      ]);
      const call = prisma.brandVoice.upsert.mock.calls[0]![0] as {
        where: { brandProfileId: string };
        create: { brandProfileId: string; toneOfVoice: string | null };
        update: { toneOfVoice: string | null };
      };
      expect(call.where.brandProfileId).toBe('brand-1');
      expect(call.create.toneOfVoice).toBe('Warm.');
      expect(call.update.toneOfVoice).toBe('Warm.');
    });

    it('persists null toneOfVoice on empty payload', async () => {
      prisma.brandVoice.upsert.mockResolvedValue({
        id: 'v-4',
        brandProfileId: 'brand-1',
        toneOfVoice: null,
        preferredVocabulary: [],
        restrictedVocabulary: [],
        messagingPillars: [],
        writingStyleRules: [],
        audienceRules: [],
        approvedExamplePhrases: [],
        rejectedExamplePhrases: [],
        createdAt: new Date('2026-05-15T01:00:00.000Z'),
        updatedAt: new Date('2026-05-15T01:00:00.000Z'),
      });
      const result = await voiceRepo.upsertForBrand('brand-1', 'admin', emptyPayload);
      expect(result?.toneOfVoice).toBeNull();
    });
  });
});
