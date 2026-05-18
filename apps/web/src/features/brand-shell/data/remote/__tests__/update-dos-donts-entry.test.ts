import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { updateDosDontsEntry } from '../update-dos-donts-entry';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
  executeRequestMock.mockResolvedValue({
    data: {
      success: true,
      data: {
        id: 'dd1',
        brandId: 'b1',
        type: 'do' as const,
        category: 'tone',
        ruleText: 'updated',
        exampleText: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T01:00:00.000Z',
      },
    },
    status: 200,
  });
});

describe('updateDosDontsEntry', () => {
  it('PATCHes the entry-scoped endpoint with the partial body', async () => {
    await updateDosDontsEntry({
      brandId: 'b1',
      entryId: 'dd1',
      ruleText: 'updated',
    });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/dos-and-donts/dd1',
      method: 'PATCH',
      body: { ruleText: 'updated' },
    });
  });
});
