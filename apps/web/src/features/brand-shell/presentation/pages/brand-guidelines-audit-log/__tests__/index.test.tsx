import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';

vi.mock('../../../../data/remote/fetch-agent-audit-log', () => ({
  fetchAgentAuditLog: vi.fn(),
}));

import { fetchAgentAuditLog } from '../../../../data/remote/fetch-agent-audit-log';
import { BrandGuidelinesAuditLogPage } from '../index';

const fetchMock = vi.mocked(fetchAgentAuditLog);

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={client}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );
  render(<BrandGuidelinesAuditLogPage brandId="brand-1" />, { wrapper });
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('BrandGuidelinesAuditLogPage', () => {
  it('shows the empty state when no audit rows exist', async () => {
    fetchMock.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('brand-guidelines-audit-log-empty')).toBeDefined(),
    );
  });

  it('renders a row for each audit entry', async () => {
    fetchMock.mockResolvedValue({
      items: [
        {
          id: 'aud-1',
          requestId: 'req-1',
          clientId: 'brand-reader-agent-001',
          endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
          brandId: 'brand-1',
          versionIdReturned: 'v-1',
          requestTimestamp: '2026-05-18T10:00:00.000Z',
          responseStatus: 200,
        },
      ],
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('brand-guidelines-audit-log-row-aud-1')).toBeDefined(),
    );
    expect(screen.getByText('brand-reader-agent-001')).toBeDefined();
    expect(screen.getByText('/api/v1/brands/brand-1/guidelines/voice')).toBeDefined();
  });

  it('back link points at the per-brand workspace', async () => {
    fetchMock.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => screen.getByTestId('brand-guidelines-audit-log-back-link'));
    const link = screen.getByTestId(
      'brand-guidelines-audit-log-back-link',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/brand-guidelines/brand-1');
  });

  it('apply button refires the fetch with clientId filter', async () => {
    fetchMock.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const input = screen.getByTestId('audit-log-filter-client-id') as HTMLInputElement;
    await userEvent.type(input, 'agent-001');
    await userEvent.click(screen.getByTestId('audit-log-filter-apply'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('brand-1', expect.objectContaining({
        clientId: 'agent-001',
      })),
    );
  });
});
