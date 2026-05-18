import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { DetailMock } = vi.hoisted(() => ({
  DetailMock: vi.fn(
    ({ brandId, versionId }: { brandId: string; versionId: string }): ReactNode => (
      <div data-testid="brand-history-detail">{`${brandId}::${versionId}`}</div>
    ),
  ),
}));

vi.mock('@/features/brand-shell', () => ({
  BrandGuidelinesHistoryDetailPage: DetailMock,
  BrandGuidelinesHistoryPage: (): ReactNode => null,
  BrandGuidelinesEmptyPage: (): ReactNode => null,
  BrandGuidelinesDetailPage: (): ReactNode => null,
}));

import Page from '../page';

describe('app/admin/brand-guidelines/[brandId]/history/[versionId]/page', () => {
  it('awaits params and renders BrandGuidelinesHistoryDetailPage with both ids', async () => {
    const element = await Page({
      params: Promise.resolve({ brandId: 'clxbrand0001', versionId: 'clxbgv0001' }),
    });
    render(element);
    expect(screen.getByTestId('brand-history-detail')).toHaveTextContent(
      'clxbrand0001::clxbgv0001',
    );
    expect(DetailMock).toHaveBeenCalledWith(
      { brandId: 'clxbrand0001', versionId: 'clxbgv0001' },
      undefined,
    );
  });
});
