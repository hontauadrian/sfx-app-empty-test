import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchBrandGuidelinesVersions } from '../fetch-brand-guidelines-versions';

const executeRequestMock = vi.mocked(executeRequest);

afterEach(() => {
  executeRequestMock.mockReset();
});

const emptyPage = { items: [], nextCursor: null };

describe('fetchBrandGuidelinesVersions', () => {
  it('hits the versions endpoint with no params', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage } } as never);
    const page = await fetchBrandGuidelinesVersions('b-1');
    expect(page).toEqual(emptyPage);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/guidelines/versions',
    });
  });

  it('appends take to the query string when defined', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage } } as never);
    await fetchBrandGuidelinesVersions('b-1', { take: 25 });
    expect(executeRequestMock.mock.calls[0]?.[0]?.path).toBe(
      'api/v1/brands/b-1/guidelines/versions?take=25',
    );
  });

  it('appends cursor + take when both are defined', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage } } as never);
    await fetchBrandGuidelinesVersions('b-1', { take: 10, cursor: 'v-1' });
    expect(executeRequestMock.mock.calls[0]?.[0]?.path).toBe(
      'api/v1/brands/b-1/guidelines/versions?take=10&cursor=v-1',
    );
  });

  it('skips empty-string cursor', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage } } as never);
    await fetchBrandGuidelinesVersions('b-1', { cursor: '' });
    expect(executeRequestMock.mock.calls[0]?.[0]?.path).toBe(
      'api/v1/brands/b-1/guidelines/versions',
    );
  });

  it('propagates network errors from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchBrandGuidelinesVersions('b-1')).rejects.toThrow('boom');
  });
});
