import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { updateBrandMetadata } from '../update-brand-metadata';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
  executeRequestMock.mockResolvedValue({
    data: {
      success: true,
      data: {
        brandId: 'b1',
        ownerUserId: 'subject-owner',
        lastUpdatedAt: '2026-05-17T00:00:00.000Z',
        lastUpdatedByUserId: 'subject-admin',
        tags: ['en'],
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    },
    status: 200,
  });
});

describe('updateBrandMetadata', () => {
  it('PUTs tags to the metadata endpoint', async () => {
    await updateBrandMetadata({ brandId: 'b1', tags: ['en'] });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/metadata',
      method: 'PUT',
      body: { tags: ['en'] },
    });
  });
});
