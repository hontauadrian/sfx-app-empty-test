import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchVoiceRestrictedVocabulary } from '../fetch-voice-restricted-vocabulary';

const executeRequestMock = vi.mocked(executeRequest);

afterEach(() => executeRequestMock.mockReset());

describe('fetchVoiceRestrictedVocabulary', () => {
  it('hits the restricted-vocabulary endpoint and unwraps envelope', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: ['cheap', 'fast'] },
    } as never);
    const result = await fetchVoiceRestrictedVocabulary('b-1');
    expect(result).toEqual(['cheap', 'fast']);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/guidelines/voice/restricted-vocabulary',
    });
  });

  it('propagates errors', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('401'));
    await expect(fetchVoiceRestrictedVocabulary('b-1')).rejects.toThrow('401');
  });

  it('returns empty array when API returns empty list', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: [] },
    } as never);
    expect(await fetchVoiceRestrictedVocabulary('b-1')).toEqual([]);
  });
});
