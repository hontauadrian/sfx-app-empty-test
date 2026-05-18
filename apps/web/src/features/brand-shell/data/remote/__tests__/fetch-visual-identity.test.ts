import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchVisualIdentity } from '../fetch-visual-identity';
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

describe('fetchVisualIdentity', () => {
  it('returns the data model from the envelope', async () => {
    const payload = dto();
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: payload },
      status: 200,
    });
    expect(await fetchVisualIdentity('clxbrand0001')).toEqual(payload);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: visualIdentityEndpoint('clxbrand0001'),
    });
  });

  it('returns null when api envelope wraps null', async () => {
    executeRequestMock.mockResolvedValueOnce({
      data: { success: true, data: null },
      status: 200,
    });
    expect(await fetchVisualIdentity('clxbrand0001')).toBeNull();
  });

  it('propagates network errors', async () => {
    executeRequestMock.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchVisualIdentity('clxbrand0001')).rejects.toThrow('boom');
  });
});
