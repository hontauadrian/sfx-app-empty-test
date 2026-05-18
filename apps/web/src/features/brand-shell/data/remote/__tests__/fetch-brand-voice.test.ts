import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchBrandVoice } from '../fetch-brand-voice';
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
    preferredVocabulary: [],
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

describe('fetchBrandVoice', () => {
  it('unwraps the api envelope and returns the data model', async () => {
    const payload = dto();
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: payload },
      status: 200,
    });
    const result = await fetchBrandVoice('clxbrand0001');
    expect(result).toEqual(payload);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: brandVoiceEndpoint('clxbrand0001'),
    });
  });

  it('returns null when the api envelope wraps null', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: null },
      status: 200,
    });
    const result = await fetchBrandVoice('clxbrand0001');
    expect(result).toBeNull();
  });

  it('propagates network errors thrown by executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchBrandVoice('clxbrand0001')).rejects.toThrow('boom');
  });
});
