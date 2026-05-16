import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchDosAndDontById } from '../fetch-dos-and-dont-by-id';

describe('fetchDosAndDontById', () => {
  it('GETs the entry endpoint and unwraps the envelope', async () => {
    (executeRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, data: { id: 'e-1' } },
      status: 200,
    });
    const result = await fetchDosAndDontById({ brandId: 'b-1', entryId: 'e-1' });
    expect(result).toEqual({ id: 'e-1' });
    expect(executeRequest).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/dos-and-donts/e-1',
    });
  });
});
