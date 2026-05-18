import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));
vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@/features/presentation/toast', () => ({
  useToast: (): { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> } => ({ success: toastSuccessMock, error: toastErrorMock, dismiss: vi.fn() }),
}));

import { createBrand } from '../../../../data/remote/create-brand';
import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { CreateBrandModal } from '../index';
import { LanguageProvider } from '@/features/presentation/localization';

const createBrandMock = vi.mocked(createBrand);
const fetchBrandsMock = vi.mocked(fetchBrands);

function renderWithProviders(node: ReactNode): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LanguageProvider>{node}</LanguageProvider>
    </QueryClientProvider>,
  );
  return { client };
}

beforeEach(() => {
  createBrandMock.mockReset();
  fetchBrandsMock.mockResolvedValue([]);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CreateBrandModal', () => {
  it('returns null when open is false', () => {
    renderWithProviders(
      <CreateBrandModal open={false} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog with the localised title and input', () => {
    renderWithProviders(
      <CreateBrandModal open={true} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create brand profile')).toBeInTheDocument();
    expect(screen.getByLabelText('Brand name')).toBeInTheDocument();
  });

  it('invokes onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn();
    renderWithProviders(<CreateBrandModal open={true} onClose={onClose} onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a validation error when submitting an empty name', async () => {
    renderWithProviders(
      <CreateBrandModal open={true} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    fireEvent.submit(screen.getByRole('dialog').querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(createBrandMock).not.toHaveBeenCalled();
  });

  it('calls onCreated + onClose + success toast on a successful create', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    createBrandMock.mockResolvedValueOnce({
      id: 'clxbrand0001',
      name: 'Acme',
      slug: 'acme',
      ownerUserId: 'subject-admin',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
      deletedAt: null,
    });
    renderWithProviders(
      <CreateBrandModal open={true} onClose={onClose} onCreated={onCreated} />,
    );
    await userEvent.type(screen.getByLabelText('Brand name'), 'Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0]?.[0]?.name).toBe('Acme');
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Brand created');
  });

  it('shows an auth error toast on 401', async () => {
    createBrandMock.mockRejectedValueOnce({ status: 401 });
    renderWithProviders(
      <CreateBrandModal open={true} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText('Brand name'), 'Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toBe('Your session expired. Sign in again.');
  });

  it('shows a generic error toast on 500', async () => {
    createBrandMock.mockRejectedValueOnce({ status: 500 });
    renderWithProviders(
      <CreateBrandModal open={true} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText('Brand name'), 'Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toBe('We could not complete that. Try again.');
  });
});
