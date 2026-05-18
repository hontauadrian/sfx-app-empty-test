import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { renameBrand } from '../rename-brand';
import { BRANDS_ENDPOINT } from '../../../constants';
import type { BrandDataModel } from '../../model/brand-data-model';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

function dto(over: Partial<BrandDataModel> = {}): BrandDataModel {
  return {
    id: 'clxbrand0001',
    name: 'Renamed',
    slug: 'renamed',
    ownerUserId: 'subject-admin',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

describe('renameBrand', () => {
  it('PATCHes the brand by id and unwraps the envelope', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: dto() },
      status: 200,
    });
    const result = await renameBrand({ id: 'clxbrand0001', name: 'Renamed' });
    expect(result.name).toBe('Renamed');
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: `${BRANDS_ENDPOINT}/clxbrand0001`,
      method: 'PATCH',
      body: { name: 'Renamed' },
    });
  });

  it('propagates rejection from executeRequest on 404', async () => {
    executeRequestMock.mockRejectedValueOnce({ message: 'not found', status: 404 });
    await expect(
      renameBrand({ id: 'missing', name: 'New' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
