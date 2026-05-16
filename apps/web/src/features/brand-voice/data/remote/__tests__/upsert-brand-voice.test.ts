import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { brandVoiceEndpoint } from '@/features/brand-voice/constants';
import { upsertBrandVoice } from '../upsert-brand-voice';

describe('upsertBrandVoice', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('issues a PUT to the voice endpoint with the payload body', async () => {
    const payload = {
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer.' }],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
    };
    const response = { ...payload, brandProfileId: 'brand-1', createdAt: null, updatedAt: null };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: response },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await upsertBrandVoice({ brandId: 'brand-1', payload });

    expect(executeRequest).toHaveBeenCalledWith({
      path: brandVoiceEndpoint('brand-1'),
      method: 'PUT',
      body: payload,
    });
    expect(result.brandProfileId).toBe('brand-1');
  });

  it('propagates the underlying request error', async () => {
    vi.mocked(executeRequest).mockRejectedValueOnce(new Error('boom'));
    await expect(
      upsertBrandVoice({ brandId: 'brand-1', payload: {} as never }),
    ).rejects.toThrow('boom');
  });
});
