import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchDosAndDonts } from '../fetch-dos-and-donts';

describe('fetchDosAndDonts', () => {
  it('GETs the list endpoint and unwraps the envelope', async () => {
    (executeRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, data: [{ id: 'e-1' }] },
      status: 200,
    });
    const result = await fetchDosAndDonts({ brandId: 'b-1' });
    expect(result).toEqual([{ id: 'e-1' }]);
    expect(executeRequest).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/dos-and-donts',
    });
  });

  it('appends ?category=<enum> when supplied', async () => {
    (executeRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, data: [] },
      status: 200,
    });
    await fetchDosAndDonts({ brandId: 'b-1', category: 'tone' });
    expect(executeRequest).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/dos-and-donts?category=tone',
    });
  });
});
