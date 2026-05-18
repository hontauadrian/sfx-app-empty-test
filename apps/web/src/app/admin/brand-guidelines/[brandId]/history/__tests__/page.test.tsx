import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { HistoryMock } = vi.hoisted(() => ({
  HistoryMock: vi.fn(({ brandId }: { brandId: string }): ReactNode => (
    <div data-testid="brand-history">{brandId}</div>
  )),
}));

vi.mock('@/features/brand-shell', () => ({
  BrandGuidelinesHistoryPage: HistoryMock,
  BrandGuidelinesHistoryDetailPage: (): ReactNode => null,
  BrandGuidelinesEmptyPage: (): ReactNode => null,
  BrandGuidelinesDetailPage: (): ReactNode => null,
}));

import Page from '../page';

describe('app/admin/brand-guidelines/[brandId]/history/page', () => {
  it('awaits params and renders BrandGuidelinesHistoryPage with brandId', async () => {
    const element = await Page({ params: Promise.resolve({ brandId: 'clxbrand0001' }) });
    render(element);
    expect(screen.getByTestId('brand-history')).toHaveTextContent('clxbrand0001');
    expect(HistoryMock).toHaveBeenCalledWith({ brandId: 'clxbrand0001' }, undefined);
  });
});
