import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '@/features/brand-profile/constants';
import { createBrand } from '../create-brand';

describe('createBrand', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('POSTs the create payload to the brands endpoint', async () => {
    const payload = {
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: 'desc',
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: payload },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await createBrand({ name: 'Acme', description: 'desc' });

    expect(executeRequest).toHaveBeenCalledWith({
      path: BRANDS_ENDPOINT,
      method: 'POST',
      body: { name: 'Acme', description: 'desc' },
    });
    expect(result).toEqual(payload);
  });
});
