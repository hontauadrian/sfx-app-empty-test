import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchGuidelineSearch } from '../fetch-guideline-search';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
  executeRequestMock.mockResolvedValue({
    data: { success: true, data: { query: 'q', brandId: 'b1', groups: [] } },
    status: 200,
  });
});

describe('fetchGuidelineSearch', () => {
  it('encodes the query and hits the search endpoint', async () => {
    await fetchGuidelineSearch({ brandId: 'b1', query: 'word mark' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/search?q=word%20mark',
    });
  });

  it('omits the query string when query is empty', async () => {
    await fetchGuidelineSearch({ brandId: 'b1', query: '' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/search',
    });
  });
});
