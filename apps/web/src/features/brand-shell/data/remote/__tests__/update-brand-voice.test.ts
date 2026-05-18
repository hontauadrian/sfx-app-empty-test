import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { updateBrandVoice } from '../update-brand-voice';
import { brandVoiceEndpoint } from '../../../constants';
import type { BrandVoiceDataModel } from '../../model/brand-voice-data-model';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

function dto(): BrandVoiceDataModel {
  return {
    brandId: 'clxbrand0001',
    tone: 'Bold',
    preferredVocabulary: ['craft'],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: '',
    audienceRules: [],
    approvedExamples: [],
    rejectedExamples: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}

describe('updateBrandVoice', () => {
  it('PUTs the body to the brand voice endpoint and returns the persisted data', async () => {
    const payload = dto();
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: payload },
      status: 200,
    });
    const result = await updateBrandVoice('clxbrand0001', {
      tone: 'Bold',
      preferredVocabulary: ['craft'],
    });
    expect(result).toEqual(payload);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: brandVoiceEndpoint('clxbrand0001'),
      method: 'PUT',
      body: { tone: 'Bold', preferredVocabulary: ['craft'] },
    });
  });

  it('propagates errors from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('400 validation failed'));
    await expect(
      updateBrandVoice('clxbrand0001', { tone: '' }),
    ).rejects.toThrow('400 validation failed');
  });
});
