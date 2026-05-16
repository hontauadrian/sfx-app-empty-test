import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { visualIdentityEndpoint } from '@/features/visual-identity/constants';
import { upsertVisualIdentity } from '../upsert-visual-identity';

describe('upsertVisualIdentity', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('issues a PUT with the payload and unwraps the envelope', async () => {
    const payload = {
      logoUsageRules: 'Clear space.',
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
    };
    const response = {
      id: 'vi-1',
      brandId: 'brand-1',
      ...payload,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: response },
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await upsertVisualIdentity({ brandId: 'brand-1', payload });

    expect(executeRequest).toHaveBeenCalledWith({
      path: visualIdentityEndpoint('brand-1'),
      method: 'PUT',
      body: payload,
    });
    expect(result.brandId).toBe('brand-1');
  });

  it('propagates the underlying request error', async () => {
    vi.mocked(executeRequest).mockRejectedValueOnce(new Error('boom'));
    await expect(
      upsertVisualIdentity({ brandId: 'brand-1', payload: {} as never }),
    ).rejects.toThrow('boom');
  });
});
