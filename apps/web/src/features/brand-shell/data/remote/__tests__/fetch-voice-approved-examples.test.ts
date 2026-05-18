import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchVoiceApprovedExamples } from '../fetch-voice-approved-examples';

const executeRequestMock = vi.mocked(executeRequest);

afterEach(() => executeRequestMock.mockReset());

describe('fetchVoiceApprovedExamples', () => {
  it('hits the approved-examples endpoint and unwraps envelope', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: [{ phrase: 'Partner up.' }] },
    } as never);
    const result = await fetchVoiceApprovedExamples('b-1');
    expect(result).toEqual([{ phrase: 'Partner up.' }]);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/guidelines/voice/approved-examples',
    });
  });

  it('returns empty array when none', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: [] },
    } as never);
    expect(await fetchVoiceApprovedExamples('b-1')).toEqual([]);
  });

  it('propagates errors', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('403'));
    await expect(fetchVoiceApprovedExamples('b-1')).rejects.toThrow('403');
  });
});
