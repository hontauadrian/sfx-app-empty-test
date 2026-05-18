import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { createBrand } from '../create-brand';
import { BRANDS_ENDPOINT } from '../../../constants';
import type { BrandDataModel } from '../../model/brand-data-model';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

function dto(): BrandDataModel {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    deletedAt: null,
  };
}

describe('createBrand', () => {
  it('POSTs the input to BRANDS_ENDPOINT and unwraps the envelope', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: dto() },
      status: 201,
    });
    const result = await createBrand({ name: 'Acme' });
    expect(result).toEqual(dto());
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: BRANDS_ENDPOINT,
      method: 'POST',
      body: { name: 'Acme' },
    });
  });

  it('propagates rejection from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce({ message: 'boom', status: 400 });
    await expect(createBrand({ name: '' })).rejects.toMatchObject({ status: 400 });
  });
});
