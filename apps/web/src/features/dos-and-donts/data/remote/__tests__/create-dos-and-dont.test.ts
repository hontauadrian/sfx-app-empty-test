import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { createDosAndDont } from '../create-dos-and-dont';

describe('createDosAndDont', () => {
  it('POSTs to the collection endpoint with the payload and unwraps the envelope', async () => {
    (executeRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, data: { id: 'e-1', brandId: 'b-1' } },
      status: 201,
    });
    const payload = {
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
    } as const;
    const result = await createDosAndDont({ brandId: 'b-1', payload });
    expect(result).toEqual({ id: 'e-1', brandId: 'b-1' });
    expect(executeRequest).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/dos-and-donts',
      method: 'POST',
      body: payload,
    });
  });
});
