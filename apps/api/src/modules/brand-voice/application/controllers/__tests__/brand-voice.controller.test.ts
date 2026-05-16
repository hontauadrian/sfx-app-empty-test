import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrandProfile,
  BrandVoice,
  BrandVoiceUpsertInput,
  IBrandProfileRepository,
  IBrandVoiceRepository,
} from '@sfx/domain';
import { BrandVoiceController } from '../brand-voice.controller';
import type { AuthenticatedRequest } from '../../../../auth/application/types/authenticated-request';

function buildBrand(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    id: 'brand-1',
    ownerSubject: 'sub-1',
    name: 'Acme',
    description: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    ...overrides,
  };
}

function buildVoice(overrides: Partial<BrandVoice> = {}): BrandVoice {
  return {
    id: 'voice-1',
    brandProfileId: 'brand-1',
    toneOfVoice: 'Warm.',
    preferredVocabulary: ['craft'],
    restrictedVocabulary: ['utilize'],
    messagingPillars: ['Trust'],
    writingStyleRules: ['Use active voice.'],
    audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
    approvedExamplePhrases: ['Hi'],
    rejectedExamplePhrases: ['Hey'],
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    ...overrides,
  };
}

function buildRequest(subject = 'sub-1'): AuthenticatedRequest {
  return {
    user: { subject, email: 'a@b.co', roles: ['viewer'] },
  } as AuthenticatedRequest;
}

interface BrandRepoMock extends IBrandProfileRepository {
  findById: ReturnType<typeof vi.fn>;
  listByOwner: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface VoiceRepoMock extends IBrandVoiceRepository {
  findByBrand: ReturnType<typeof vi.fn>;
  upsertForBrand: ReturnType<typeof vi.fn>;
}

function buildBrandRepoMock(): BrandRepoMock {
  return {
    findById: vi.fn(),
    listByOwner: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as BrandRepoMock;
}

function buildVoiceRepoMock(): VoiceRepoMock {
  return {
    findByBrand: vi.fn(),
    upsertForBrand: vi.fn(),
  } as VoiceRepoMock;
}

describe('BrandVoiceController', () => {
  let brandRepo: BrandRepoMock;
  let voiceRepo: VoiceRepoMock;
  let controller: BrandVoiceController;

  beforeEach(() => {
    brandRepo = buildBrandRepoMock();
    voiceRepo = buildVoiceRepoMock();
    controller = new BrandVoiceController(brandRepo, voiceRepo);
  });

  describe('getVoice', () => {
    it('returns empty defaults when no voice row exists yet', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      voiceRepo.findByBrand.mockResolvedValueOnce(null);

      const result = await controller.getVoice(buildRequest(), 'brand-1');

      expect(brandRepo.findById).toHaveBeenCalledWith('brand-1', 'sub-1');
      expect(voiceRepo.findByBrand).toHaveBeenCalledWith('brand-1', 'sub-1');
      expect(result).toEqual({
        brandProfileId: 'brand-1',
        toneOfVoice: null,
        preferredVocabulary: [],
        restrictedVocabulary: [],
        messagingPillars: [],
        writingStyleRules: [],
        audienceRules: [],
        approvedExamplePhrases: [],
        rejectedExamplePhrases: [],
        createdAt: null,
        updatedAt: null,
      });
    });

    it('returns the populated voice mapped to DTO', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      voiceRepo.findByBrand.mockResolvedValueOnce(buildVoice());

      const result = await controller.getVoice(buildRequest(), 'brand-1');

      expect(result.toneOfVoice).toBe('Warm.');
      expect(result.audienceRules).toEqual([
        { audience: 'Gen Z', rule: 'Peer-to-peer.' },
      ]);
      expect(result.createdAt).toBe('2026-05-15T00:00:00.000Z');
    });

    it('throws NotFoundException when the brand is missing or cross-tenant', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.getVoice(buildRequest('sub-other'), 'brand-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(voiceRepo.findByBrand).not.toHaveBeenCalled();
    });
  });

  describe('upsertVoice', () => {
    it('upserts a populated body and returns the mapped DTO', async () => {
      voiceRepo.upsertForBrand.mockResolvedValueOnce(buildVoice());
      const body = {
        toneOfVoice: 'Warm.',
        preferredVocabulary: ['craft'],
        restrictedVocabulary: ['utilize'],
        messagingPillars: ['Trust'],
        writingStyleRules: ['Use active voice.'],
        audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
        approvedExamplePhrases: ['Hi'],
        rejectedExamplePhrases: ['Hey'],
      };

      const result = await controller.upsertVoice(buildRequest(), 'brand-1', body);

      expect(voiceRepo.upsertForBrand).toHaveBeenCalledWith(
        'brand-1',
        'sub-1',
        expect.objectContaining({ toneOfVoice: 'Warm.' }),
      );
      expect(result.toneOfVoice).toBe('Warm.');
    });

    it('normalises an empty string toneOfVoice to null before persisting', async () => {
      voiceRepo.upsertForBrand.mockResolvedValueOnce(buildVoice({ toneOfVoice: null }));
      await controller.upsertVoice(buildRequest(), 'brand-1', { toneOfVoice: '' } as never);

      const payload = voiceRepo.upsertForBrand.mock.calls[0]?.[2] as BrandVoiceUpsertInput;
      expect(payload.toneOfVoice).toBeNull();
    });

    it('defaults missing list fields to empty arrays', async () => {
      voiceRepo.upsertForBrand.mockResolvedValueOnce(
        buildVoice({
          toneOfVoice: null,
          preferredVocabulary: [],
          restrictedVocabulary: [],
          messagingPillars: [],
          writingStyleRules: [],
          audienceRules: [],
          approvedExamplePhrases: [],
          rejectedExamplePhrases: [],
        }),
      );
      await controller.upsertVoice(buildRequest(), 'brand-1', {} as never);
      const payload = voiceRepo.upsertForBrand.mock.calls[0]?.[2] as BrandVoiceUpsertInput;
      expect(payload.preferredVocabulary).toEqual([]);
      expect(payload.audienceRules).toEqual([]);
    });

    it('throws NotFoundException when the repository returns null (cross-tenant or missing)', async () => {
      voiceRepo.upsertForBrand.mockResolvedValueOnce(null);
      await expect(
        controller.upsertVoice(buildRequest('sub-other'), 'brand-1', {} as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
