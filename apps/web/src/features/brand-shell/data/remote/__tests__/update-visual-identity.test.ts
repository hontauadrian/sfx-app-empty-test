import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { updateVisualIdentity } from '../update-visual-identity';
import { visualIdentityEndpoint } from '../../../constants';
import type { VisualIdentityDataModel } from '../../model/visual-identity-data-model';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

function dto(): VisualIdentityDataModel {
  return {
    brandId: 'clxbrand0001',
    logoUsage: 'Default',
    colorPalette: [],
    typography: [],
    spacingGuidance: '',
    imageStyleGuidance: '',
    iconographyGuidance: '',
    usageRestrictions: '',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}

describe('updateVisualIdentity', () => {
  it('PUTs the body and returns the persisted data', async () => {
    const payload = dto();
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: payload },
      status: 200,
    });
    const result = await updateVisualIdentity('clxbrand0001', { logoUsage: 'Default' });
    expect(result).toEqual(payload);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: visualIdentityEndpoint('clxbrand0001'),
      method: 'PUT',
      body: { logoUsage: 'Default' },
    });
  });

  it('propagates errors', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('400'));
    await expect(
      updateVisualIdentity('clxbrand0001', { logoUsage: '' }),
    ).rejects.toThrow('400');
  });
});
