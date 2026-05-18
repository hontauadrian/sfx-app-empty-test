import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

import { redirect } from 'next/navigation';
import AdminPage from '../page';

describe('AdminPage', () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('throws the NEXT_REDIRECT navigation signal when invoked', () => {
    expect(() => AdminPage()).toThrow('NEXT_REDIRECT');
  });

  it('calls redirect with /admin/company-info', () => {
    try {
      AdminPage();
    } catch {
      // expected — redirect throws
    }
    expect(redirect).toHaveBeenCalledWith('/admin/company-info');
  });
});
