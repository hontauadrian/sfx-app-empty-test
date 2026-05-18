import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { deleteBrand } from '../delete-brand';
import { BRANDS_ENDPOINT } from '../../../constants';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

describe('deleteBrand', () => {
  it('DELETEs the brand by id', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: undefined as never, status: 204 });
    await deleteBrand({ id: 'clxbrand0001' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: `${BRANDS_ENDPOINT}/clxbrand0001`,
      method: 'DELETE',
    });
  });

  it('propagates rejection from executeRequest on 404', async () => {
    executeRequestMock.mockRejectedValueOnce({ message: 'not found', status: 404 });
    await expect(deleteBrand({ id: 'missing' })).rejects.toMatchObject({ status: 404 });
  });

  it('swallows a SyntaxError thrown by empty-body 204 response parsing', async () => {
    executeRequestMock.mockRejectedValueOnce(new SyntaxError('Unexpected end of JSON input'));
    await expect(deleteBrand({ id: 'clxbrand0001' })).resolves.toBeUndefined();
  });
});
