import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type {
  Brand,
  BrandGuidelinesVersionRepository,
  BrandRepository,
  BrandVoice,
  BrandVoiceRepository,
} from '@sfx/domain';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandVoiceController } from '../brand-voice.controller';
import type { RequestWithAuthenticatedUser } from '../../../../../common/guards/jwt-auth.guard';

type BrandRepoMock = {
  listActive: Mock;
  findActiveById: Mock;
  create: Mock;
  renameById: Mock;
  softDeleteById: Mock;
};

type VoiceRepoMock = {
  findByBrandId: Mock;
  upsertForBrand: Mock;
};

type VersionRepoMock = {
  list: Mock;
  findById: Mock;
  findLatestForBrand: Mock;
};

function makeBrand(): Brand {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    deletedAt: null,
  };
}

function makeVoice(over: Partial<BrandVoice> = {}): BrandVoice {
  return {
    brandId: 'clxbrand0001',
    tone: 'Bold',
    preferredVocabulary: [],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: '',
    audienceRules: [],
    approvedExamples: [],
    rejectedExamples: [],
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    ...over,
  };
}

const adminReq = {
  user: { subject: 'subject-admin', email: 'admin@example.test', roles: ['admin'] },
} as unknown as RequestWithAuthenticatedUser;

const expectedEditor = {
  editorUserId: 'subject-admin',
  editorDisplayName: 'admin@example.test',
};

describe('BrandVoiceController', () => {
  let brandRepo: BrandRepoMock;
  let voiceRepo: VoiceRepoMock;
  let versionRepo: VersionRepoMock;
  let controller: BrandVoiceController;

  beforeEach(() => {
    brandRepo = {
      listActive: vi.fn(),
      findActiveById: vi.fn(),
      create: vi.fn(),
      renameById: vi.fn(),
      softDeleteById: vi.fn(),
    };
    voiceRepo = { findByBrandId: vi.fn(), upsertForBrand: vi.fn() };
    versionRepo = {
      list: vi.fn(),
      findById: vi.fn(),
      findLatestForBrand: vi.fn().mockResolvedValue(null),
    };
    controller = new BrandVoiceController(
      brandRepo as unknown as BrandRepository,
      voiceRepo as unknown as BrandVoiceRepository,
      versionRepo as unknown as BrandGuidelinesVersionRepository,
    );
  });

  describe('getVoice', () => {
    it('returns voice + latestVersionId null when no version exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(makeVoice({ tone: 'Confident' }));
      const result = await controller.getVoice('clxbrand0001');
      expect(result?.tone).toBe('Confident');
      expect(result?.latestVersionId).toBeNull();
    });

    it('returns voice + latestVersionId when version exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(makeVoice());
      versionRepo.findLatestForBrand.mockResolvedValue({ id: 'v-1' });
      const result = await controller.getVoice('clxbrand0001');
      expect(result?.latestVersionId).toBe('v-1');
    });

    it('returns null when the brand exists but no voice has been saved', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(null);
      expect(await controller.getVoice('clxbrand0001')).toBeNull();
    });

    it('throws NotFoundException when the brand is missing or soft-deleted', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(controller.getVoice('absent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('putVoice', () => {
    it('upserts the voice with editor + null changeNote and returns latestVersionId', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.upsertForBrand.mockResolvedValue(makeVoice({ tone: 'Bold' }));
      versionRepo.findLatestForBrand.mockResolvedValue({ id: 'v-1' });
      const result = await controller.putVoice('clxbrand0001', { tone: 'Bold' }, {}, adminReq);
      expect(result.tone).toBe('Bold');
      expect(result.latestVersionId).toBe('v-1');
      expect(voiceRepo.upsertForBrand).toHaveBeenCalledWith(
        'clxbrand0001',
        { tone: 'Bold' },
        expectedEditor,
        null,
      );
    });

    it('threads changeNote when provided', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.upsertForBrand.mockResolvedValue(makeVoice());
      await controller.putVoice('clxbrand0001', { tone: 'Bold' }, { changeNote: 'tone' }, adminReq);
      expect(voiceRepo.upsertForBrand).toHaveBeenCalledWith(
        'clxbrand0001',
        { tone: 'Bold' },
        expectedEditor,
        'tone',
      );
    });

    it('throws UnauthorizedException when req.user is missing', async () => {
      const req = {} as RequestWithAuthenticatedUser;
      await expect(
        controller.putVoice('clxbrand0001', { tone: 'Bold' }, {}, req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws NotFoundException when the brand is missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(
        controller.putVoice('absent', { tone: 'Bold' }, {}, adminReq),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('falls back to subject when authenticated user email is missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.upsertForBrand.mockResolvedValue(makeVoice());
      const req = {
        user: { subject: 'subject-x', roles: ['admin'] },
      } as unknown as RequestWithAuthenticatedUser;
      await controller.putVoice('clxbrand0001', { tone: 'Bold' }, {}, req);
      expect(voiceRepo.upsertForBrand).toHaveBeenCalledWith(
        'clxbrand0001',
        { tone: 'Bold' },
        { editorUserId: 'subject-x', editorDisplayName: 'subject-x' },
        null,
      );
    });
  });

  describe('standalone Voice list reads', () => {
    it('returns empty restricted-vocabulary when no voice exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(null);
      expect(await controller.getRestrictedVocabulary('clxbrand0001')).toEqual([]);
    });

    it('returns the restricted-vocabulary list when voice exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(makeVoice({ restrictedVocabulary: ['cheap'] }));
      expect(await controller.getRestrictedVocabulary('clxbrand0001')).toEqual(['cheap']);
    });

    it('returns empty approved-examples when no voice exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(null);
      expect(await controller.getApprovedExamples('clxbrand0001')).toEqual([]);
    });

    it('returns approved-examples when voice exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(
        makeVoice({ approvedExamples: [{ phrase: 'Partner up.' }] }),
      );
      expect(await controller.getApprovedExamples('clxbrand0001')).toEqual([
        { phrase: 'Partner up.' },
      ]);
    });

    it('returns empty rejected-examples when no voice exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(null);
      expect(await controller.getRejectedExamples('clxbrand0001')).toEqual([]);
    });

    it('returns rejected-examples when voice exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      voiceRepo.findByBrandId.mockResolvedValue(
        makeVoice({ rejectedExamples: [{ phrase: 'bad', reason: null }] }),
      );
      expect(await controller.getRejectedExamples('clxbrand0001')).toEqual([
        { phrase: 'bad', reason: null },
      ]);
    });

    it('throws 404 when brand missing on standalone reads', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(controller.getRestrictedVocabulary('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(controller.getApprovedExamples('x')).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.getRejectedExamples('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
