import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchBrandMetadata } from '../fetch-brand-metadata';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

describe('fetchBrandMetadata', () => {
  it('hits the metadata endpoint and unwraps the envelope', async () => {
    const metadata = {
      brandId: 'b1',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: '2026-05-17T00:00:00.000Z',
      lastUpdatedByUserId: 'subject-admin',
      tags: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    };
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: metadata },
      status: 200,
    });
    expect(await fetchBrandMetadata({ brandId: 'b1' })).toEqual(metadata);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/metadata',
    });
  });
});
