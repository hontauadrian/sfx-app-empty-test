import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '@/features/brand-profile/constants';
import { updateBrand } from '../update-brand';

describe('updateBrand', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('PUTs the update payload to the per-brand endpoint and strips the id from the body', async () => {
    const payload = {
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Renamed',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T11:00:00.000Z',
    };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: payload },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await updateBrand({ id: 'brand-1', name: 'Renamed', description: null });

    expect(executeRequest).toHaveBeenCalledWith({
      path: `${BRANDS_ENDPOINT}/brand-1`,
      method: 'PUT',
      body: { name: 'Renamed', description: null },
    });
    expect(result).toEqual(payload);
  });
});
