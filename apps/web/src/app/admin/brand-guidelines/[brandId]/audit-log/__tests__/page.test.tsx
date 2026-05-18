import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { AuditLogMock } = vi.hoisted(() => ({
  AuditLogMock: vi.fn(({ brandId }: { brandId: string }): ReactNode => (
    <div data-testid="brand-audit-log">{brandId}</div>
  )),
}));

vi.mock('@/features/brand-shell', () => ({
  BrandGuidelinesAuditLogPage: AuditLogMock,
  BrandGuidelinesEmptyPage: (): ReactNode => null,
  BrandGuidelinesDetailPage: (): ReactNode => null,
  BrandGuidelinesHistoryPage: (): ReactNode => null,
  BrandGuidelinesHistoryDetailPage: (): ReactNode => null,
}));

import Page from '../page';

describe('app/admin/brand-guidelines/[brandId]/audit-log/page', () => {
  it('awaits params and renders BrandGuidelinesAuditLogPage with brandId', async () => {
    const element = await Page({ params: Promise.resolve({ brandId: 'clxbrand0001' }) });
    render(element);
    expect(screen.getByTestId('brand-audit-log')).toHaveTextContent('clxbrand0001');
    expect(AuditLogMock).toHaveBeenCalledWith({ brandId: 'clxbrand0001' }, undefined);
  });
});
