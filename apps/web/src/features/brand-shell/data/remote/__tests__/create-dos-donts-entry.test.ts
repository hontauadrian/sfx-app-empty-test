import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { createDosDontsEntry } from '../create-dos-donts-entry';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

describe('createDosDontsEntry', () => {
  it('POSTs the brand-scoped endpoint and unwraps the envelope', async () => {
    const created = {
      id: 'dd1',
      brandId: 'b1',
      type: 'do' as const,
      category: 'tone',
      ruleText: 'r',
      exampleText: null,
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    };
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: created },
      status: 201,
    });
    const result = await createDosDontsEntry({
      brandId: 'b1',
      type: 'do',
      category: 'tone',
      ruleText: 'r',
    });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/dos-and-donts',
      method: 'POST',
      body: { type: 'do', category: 'tone', ruleText: 'r' },
    });
    expect(result).toEqual(created);
  });
});
