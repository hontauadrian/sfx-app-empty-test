import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { deleteDosDontsEntry } from '../delete-dos-donts-entry';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
  executeRequestMock.mockResolvedValue({ data: undefined, status: 204 });
});

describe('deleteDosDontsEntry', () => {
  it('issues DELETE against the entry-scoped endpoint', async () => {
    await deleteDosDontsEntry({ brandId: 'b1', entryId: 'dd1' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b1/guidelines/dos-and-donts/dd1',
      method: 'DELETE',
    });
  });
});
