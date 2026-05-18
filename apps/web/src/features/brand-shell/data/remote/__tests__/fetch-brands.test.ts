import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchBrands } from '../fetch-brands';
import { BRANDS_ENDPOINT } from '../../../constants';
import type { BrandDataModel } from '../../model/brand-data-model';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

function dto(over: Partial<BrandDataModel> = {}): BrandDataModel {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

describe('fetchBrands', () => {
  it('unwraps the envelope and returns the brands array', async () => {
    const payload = [dto(), dto({ id: 'clxbrand0002', name: 'Beta', slug: 'beta' })];
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: { brands: payload } },
      status: 200,
    });
    expect(await fetchBrands()).toEqual(payload);
  });

  it('returns an empty array when the API reports no brands', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: { brands: [] } },
      status: 200,
    });
    expect(await fetchBrands()).toEqual([]);
  });

  it('calls executeRequest against BRANDS_ENDPOINT with default GET', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: { brands: [] } },
      status: 200,
    });
    await fetchBrands();
    expect(executeRequestMock).toHaveBeenCalledTimes(1);
    expect(executeRequestMock).toHaveBeenCalledWith({ path: BRANDS_ENDPOINT });
  });

  it('propagates rejection from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce({ message: 'boom', status: 500 });
    await expect(fetchBrands()).rejects.toMatchObject({ status: 500 });
  });
});
