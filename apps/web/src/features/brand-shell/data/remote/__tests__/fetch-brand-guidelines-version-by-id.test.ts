import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchBrandGuidelinesVersionById } from '../fetch-brand-guidelines-version-by-id';

const executeRequestMock = vi.mocked(executeRequest);

afterEach(() => executeRequestMock.mockReset());

const sampleVersion = {
  id: 'v-1',
  brandId: 'b-1',
  snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
  editorUserId: 'u-1',
  editorDisplayName: 'Admin',
  changeNote: null,
  createdAt: '2026-05-17T00:00:00.000Z',
};

describe('fetchBrandGuidelinesVersionById', () => {
  it('fetches the version by id with URL-encoded path params', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: sampleVersion },
    } as never);
    const version = await fetchBrandGuidelinesVersionById('b-1', 'v-1');
    expect(version.id).toBe('v-1');
    expect(executeRequestMock.mock.calls[0]?.[0]?.path).toBe(
      'api/v1/brands/b-1/guidelines/versions/v-1',
    );
  });

  it('encodes special characters in ids', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: sampleVersion },
    } as never);
    await fetchBrandGuidelinesVersionById('b/1', 'v 2');
    expect(executeRequestMock.mock.calls[0]?.[0]?.path).toBe(
      'api/v1/brands/b%2F1/guidelines/versions/v%202',
    );
  });

  it('propagates errors', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('404'));
    await expect(fetchBrandGuidelinesVersionById('b-1', 'v-x')).rejects.toThrow('404');
  });
});
