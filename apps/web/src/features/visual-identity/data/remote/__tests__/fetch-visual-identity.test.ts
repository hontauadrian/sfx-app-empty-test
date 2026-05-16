import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { visualIdentityEndpoint } from '@/features/visual-identity/constants';
import { fetchVisualIdentity } from '../fetch-visual-identity';

describe('fetchVisualIdentity', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('requests the visual-identity endpoint and unwraps the envelope', async () => {
    const payload = {
      id: '',
      brandId: 'brand-1',
      logoUsageRules: null,
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: payload },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await fetchVisualIdentity('brand-1');

    expect(executeRequest).toHaveBeenCalledWith({
      path: visualIdentityEndpoint('brand-1'),
    });
    expect(result).toEqual(payload);
  });

  it('propagates the underlying request error', async () => {
    vi.mocked(executeRequest).mockRejectedValueOnce(new Error('boom'));
    await expect(fetchVisualIdentity('brand-1')).rejects.toThrow('boom');
  });
});
