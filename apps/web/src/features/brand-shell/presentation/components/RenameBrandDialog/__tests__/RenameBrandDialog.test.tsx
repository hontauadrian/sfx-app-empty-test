import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Brand } from '@sfx/domain';

vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));
vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@/features/presentation/toast', () => ({
  useToast: (): { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> } => ({ success: toastSuccessMock, error: toastErrorMock, dismiss: vi.fn() }),
}));

import { renameBrand } from '../../../../data/remote/rename-brand';
import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { RenameBrandDialog } from '../index';
import { LanguageProvider } from '@/features/presentation/localization';

const renameBrandMock = vi.mocked(renameBrand);
const fetchBrandsMock = vi.mocked(fetchBrands);

const brand: Brand = {
  id: 'clxbrand0001',
  name: 'Old',
  slug: 'old',
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
  renameBrandMock.mockReset();
  fetchBrandsMock.mockResolvedValue([]);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RenameBrandDialog', () => {
  it('returns null when open is false', () => {
    renderWithProviders(
      <RenameBrandDialog open={false} brand={brand} onClose={vi.fn()} onRenamed={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns null when no brand is provided', () => {
    renderWithProviders(
      <RenameBrandDialog open={true} brand={null} onClose={vi.fn()} onRenamed={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pre-fills the form with the current brand name', () => {
    renderWithProviders(
      <RenameBrandDialog open={true} brand={brand} onClose={vi.fn()} onRenamed={vi.fn()} />,
    );
    expect(screen.getByLabelText('Brand name')).toHaveValue('Old');
  });

  it('calls onRenamed + onClose + success toast on a successful rename', async () => {
    const onRenamed = vi.fn();
    const onClose = vi.fn();
    renameBrandMock.mockResolvedValueOnce({
      id: 'clxbrand0001',
      name: 'New',
      slug: 'new',
      ownerUserId: 'subject-admin',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
      deletedAt: null,
    });
    renderWithProviders(
      <RenameBrandDialog open={true} brand={brand} onClose={onClose} onRenamed={onRenamed} />,
    );
    const input = screen.getByLabelText('Brand name');
    await userEvent.clear(input);
    await userEvent.type(input, 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onRenamed).toHaveBeenCalled());
    expect(onRenamed.mock.calls[0]?.[0]?.name).toBe('New');
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Brand renamed');
  });

  it('shows a validation error for an empty name', async () => {
    renderWithProviders(
      <RenameBrandDialog open={true} brand={brand} onClose={vi.fn()} onRenamed={vi.fn()} />,
    );
    await userEvent.clear(screen.getByLabelText('Brand name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(renameBrandMock).not.toHaveBeenCalled();
  });

  it('closes and toasts on 404 (the brand vanished)', async () => {
    renameBrandMock.mockRejectedValueOnce({ status: 404 });
    const onClose = vi.fn();
    renderWithProviders(
      <RenameBrandDialog open={true} brand={brand} onClose={onClose} onRenamed={vi.fn()} />,
    );
    await userEvent.clear(screen.getByLabelText('Brand name'));
    await userEvent.type(screen.getByLabelText('Brand name'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('shows the auth toast on 401', async () => {
    renameBrandMock.mockRejectedValueOnce({ status: 401 });
    renderWithProviders(
      <RenameBrandDialog open={true} brand={brand} onClose={vi.fn()} onRenamed={vi.fn()} />,
    );
    await userEvent.clear(screen.getByLabelText('Brand name'));
    await userEvent.type(screen.getByLabelText('Brand name'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toBe('Your session expired. Sign in again.');
  });
});
