import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchVoiceRejectedExamples } from '../fetch-voice-rejected-examples';

const executeRequestMock = vi.mocked(executeRequest);

afterEach(() => executeRequestMock.mockReset());

describe('fetchVoiceRejectedExamples', () => {
  it('hits the rejected-examples endpoint and unwraps envelope', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: [{ phrase: 'bad', reason: null }] },
    } as never);
    const result = await fetchVoiceRejectedExamples('b-1');
    expect(result).toEqual([{ phrase: 'bad', reason: null }]);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/guidelines/voice/rejected-examples',
    });
  });

  it('returns empty array when none', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: [] },
    } as never);
    expect(await fetchVoiceRejectedExamples('b-1')).toEqual([]);
  });

  it('propagates errors', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('404'));
    await expect(fetchVoiceRejectedExamples('b-1')).rejects.toThrow('404');
  });
});
