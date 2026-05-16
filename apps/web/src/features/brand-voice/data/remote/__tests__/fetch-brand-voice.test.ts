import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { brandVoiceEndpoint } from '@/features/brand-voice/constants';
import { fetchBrandVoice } from '../fetch-brand-voice';

describe('fetchBrandVoice', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('requests the voice endpoint and unwraps the envelope', async () => {
    const payload = {
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
    };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: payload },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await fetchBrandVoice('brand-1');

    expect(executeRequest).toHaveBeenCalledWith({
      path: brandVoiceEndpoint('brand-1'),
    });
    expect(result).toEqual(payload);
  });

  it('propagates the underlying request error', async () => {
    vi.mocked(executeRequest).mockRejectedValueOnce(new Error('boom'));
    await expect(fetchBrandVoice('brand-1')).rejects.toThrow('boom');
  });
});
