import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '@/features/brand-profile/constants';
import { deleteBrand } from '../delete-brand';

describe('deleteBrand', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('DELETEs the per-brand endpoint', async () => {
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: null },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    await deleteBrand('brand-1');

    expect(executeRequest).toHaveBeenCalledWith({
      path: `${BRANDS_ENDPOINT}/brand-1`,
      method: 'DELETE',
    });
  });

  it('propagates the underlying request error', async () => {
    vi.mocked(executeRequest).mockRejectedValueOnce(new Error('not found'));
    await expect(deleteBrand('brand-1')).rejects.toThrow('not found');
  });
});
