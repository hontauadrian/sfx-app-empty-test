import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { DetailMock } = vi.hoisted(() => ({
  DetailMock: vi.fn(({ brandId }: { brandId: string }): ReactNode => (
    <div data-testid="brand-detail">{brandId}</div>
  )),
}));

vi.mock('@/features/brand-shell', () => ({
  BrandGuidelinesEmptyPage: (): ReactNode => null,
  BrandGuidelinesDetailPage: DetailMock,
}));

import Page from '../page';

describe('app/admin/brand-guidelines/[brandId]/page', () => {
  it('awaits the params promise and passes brandId to the feature page', async () => {
    const element = await Page({
      params: Promise.resolve({ brandId: 'clxbrand0001' }),
    });
    render(element);
    expect(screen.getByTestId('brand-detail')).toHaveTextContent('clxbrand0001');
    expect(DetailMock).toHaveBeenCalledWith({ brandId: 'clxbrand0001' }, undefined);
  });
});
