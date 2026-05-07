import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAuthSession } from '../fetch-auth-session';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { AUTH_ME_ENDPOINT } from '@/features/auth/constants';

describe('fetchAuthSession', () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it('requests the current auth session and returns the envelope data', async () => {
    const payload = {
      isAuthenticated: true,
      subject: 'user-1',
      email: 'user@example.com',
      roles: ['viewer'],
    };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: { success: true, data: payload },
      status: 200,
    });

    await expect(fetchAuthSession()).resolves.toEqual(payload);
    expect(executeRequest).toHaveBeenCalledWith({ path: AUTH_ME_ENDPOINT });
  });
});
