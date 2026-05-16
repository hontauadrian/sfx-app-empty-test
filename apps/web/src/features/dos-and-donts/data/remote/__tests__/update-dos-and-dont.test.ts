import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { updateDosAndDont } from '../update-dos-and-dont';

describe('updateDosAndDont', () => {
  it('PUTs to the entry endpoint with the payload', async () => {
    (executeRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, data: { id: 'e-1' } },
      status: 200,
    });
    const payload = {
      type: 'dont',
      category: 'legal',
      title: 'new',
      body: 'new',
    } as const;
    await updateDosAndDont({ brandId: 'b-1', entryId: 'e-1', payload });
    expect(executeRequest).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/dos-and-donts/e-1',
      method: 'PUT',
      body: payload,
    });
  });
});
