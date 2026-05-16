import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { deleteDosAndDont } from '../delete-dos-and-dont';

describe('deleteDosAndDont', () => {
  it('DELETEs the entry endpoint', async () => {
    (executeRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, data: null },
      status: 200,
    });
    await deleteDosAndDont({ brandId: 'b-1', entryId: 'e-1' });
    expect(executeRequest).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/dos-and-donts/e-1',
      method: 'DELETE',
    });
  });
});
