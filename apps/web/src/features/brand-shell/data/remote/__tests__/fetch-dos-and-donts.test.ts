import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchDosAndDonts } from '../fetch-dos-and-donts';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
  executeRequestMock.mockResolvedValue({
    data: { success: true, data: { items: [] } },
    status: 200,
  });
});

describe('fetchDosAndDonts', () => {
  it('hits the brand-scoped endpoint with no filters', async () => {
    await fetchDosAndDonts({ brandId: 'b1' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/dos-and-donts',
    });
  });

  it('appends type filter as a query string', async () => {
    await fetchDosAndDonts({ brandId: 'b1', type: 'dont' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/dos-and-donts?type=dont',
    });
  });

  it('appends both filters when present', async () => {
    await fetchDosAndDonts({ brandId: 'b1', type: 'do', category: 'tone' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/dos-and-donts?type=do&category=tone',
    });
  });

  it('returns the items array unchanged from envelope', async () => {
    const items = [
      {
        id: 'dd1',
        brandId: 'b1',
        type: 'do' as const,
        category: 'tone',
        ruleText: 'r',
        exampleText: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    ];
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: { items } },
      status: 200,
    });
    expect(await fetchDosAndDonts({ brandId: 'b1' })).toEqual(items);
  });
});
