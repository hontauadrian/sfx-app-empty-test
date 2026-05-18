import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Brand } from '@sfx/domain';

vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));
vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@/features/presentation/toast', () => ({
  useToast: (): { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> } => ({ success: toastSuccessMock, error: toastErrorMock, dismiss: vi.fn() }),
}));

import { deleteBrand } from '../../../../data/remote/delete-brand';
import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { DeleteBrandConfirm } from '../index';
import { LanguageProvider } from '@/features/presentation/localization';

const deleteBrandMock = vi.mocked(deleteBrand);
const fetchBrandsMock = vi.mocked(fetchBrands);

const brand: Brand = {
  id: 'clxbrand0001',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-admin',
  createdAt: new Date('2026-05-17T00:00:00.000Z'),
  updatedAt: new Date('2026-05-17T00:00:00.000Z'),
  deletedAt: null,
};

function renderWithProviders(node: ReactNode): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LanguageProvider>{node}</LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  deleteBrandMock.mockReset();
  fetchBrandsMock.mockResolvedValue([]);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteBrandConfirm', () => {
  it('renders the dialog with the brand name interpolated', () => {
    renderWithProviders(
      <DeleteBrandConfirm open={true} brand={brand} onClose={vi.fn()} onDeleted={vi.fn()} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Acme will be removed/)).toBeInTheDocument();
  });

  it('returns null when no brand is provided', () => {
    renderWithProviders(
      <DeleteBrandConfirm open={true} brand={null} onClose={vi.fn()} onDeleted={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('calls onDeleted + onClose + success toast on a successful delete', async () => {
    deleteBrandMock.mockResolvedValueOnce(undefined as unknown as void);
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <DeleteBrandConfirm open={true} brand={brand} onClose={onClose} onDeleted={onDeleted} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('clxbrand0001'));
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Brand deleted');
  });

  it('treats 404 as already-deleted (idempotency) and fires onDeleted', async () => {
    deleteBrandMock.mockRejectedValueOnce({ status: 404 });
    const onDeleted = vi.fn();
    renderWithProviders(
      <DeleteBrandConfirm open={true} brand={brand} onClose={vi.fn()} onDeleted={onDeleted} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('clxbrand0001'));
  });

  it('shows the auth error toast on 401', async () => {
    deleteBrandMock.mockRejectedValueOnce({ status: 401 });
    renderWithProviders(
      <DeleteBrandConfirm open={true} brand={brand} onClose={vi.fn()} onDeleted={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toBe('Your session expired. Sign in again.');
  });

  it('invokes onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <DeleteBrandConfirm open={true} brand={brand} onClose={onClose} onDeleted={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
