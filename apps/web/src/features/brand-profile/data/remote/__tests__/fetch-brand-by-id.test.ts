import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '@/features/brand-profile/constants';
import { fetchBrandById } from '../fetch-brand-by-id';

describe('fetchBrandById', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('requests the per-brand endpoint with the captured id', async () => {
    const payload = {
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: payload },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await fetchBrandById('brand-1');

    expect(executeRequest).toHaveBeenCalledWith({ path: `${BRANDS_ENDPOINT}/brand-1` });
    expect(result).toEqual(payload);
  });

  it('propagates the underlying request error', async () => {
    vi.mocked(executeRequest).mockRejectedValueOnce(new Error('boom'));
    await expect(fetchBrandById('brand-1')).rejects.toThrow('boom');
  });
});
