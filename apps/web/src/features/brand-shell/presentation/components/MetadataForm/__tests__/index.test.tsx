import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../data/repositories/use-brand-metadata-repository', () => ({
  useBrandMetadataRepository: vi.fn(),
}));

import { useBrandMetadataRepository } from '../../../../data/repositories/use-brand-metadata-repository';
import { LanguageProvider } from '@/features/presentation/localization';
import { MetadataForm } from '../index';

const mock = vi.mocked(useBrandMetadataRepository);

function Wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );
}

function buildRepo(overrides: Partial<ReturnType<typeof useBrandMetadataRepository>> = {}): ReturnType<
  typeof useBrandMetadataRepository
> {
  return {
    metadataQuery: {
      data: {
        brandId: 'b1',
        ownerUserId: 'subject-owner',
        lastUpdatedAt: new Date('2026-05-17T00:00:00.000Z'),
        lastUpdatedByUserId: 'subject-admin',
        tags: ['en'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isSuccess: true,
      isLoading: false,
    } as unknown as ReturnType<typeof useBrandMetadataRepository>['metadataQuery'],
    updateMutation: {
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useBrandMetadataRepository>['updateMutation'],
    ...overrides,
  } as ReturnType<typeof useBrandMetadataRepository>;
}

describe('MetadataForm', () => {
  it('renders owner + existing tags', () => {
    mock.mockReturnValue(buildRepo());
    render(<MetadataForm brandId="b1" />, { wrapper: Wrapper });
    expect(screen.getByText('Owner:')).toBeInTheDocument();
    expect(screen.getByText('subject-owner')).toBeInTheDocument();
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('adds a tag on Enter', () => {
    mock.mockReturnValue(buildRepo());
    render(<MetadataForm brandId="b1" />, { wrapper: Wrapper });
    const input = screen.getByPlaceholderText('Add a tag and press Enter');
    fireEvent.change(input, { target: { value: 'spring' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('spring')).toBeInTheDocument();
  });

  it('removes a tag via × button', () => {
    mock.mockReturnValue(buildRepo());
    render(<MetadataForm brandId="b1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag en' }));
    expect(screen.queryByText('en')).not.toBeInTheDocument();
  });

  it('fires update on save', () => {
    const mutate = vi.fn();
    mock.mockReturnValue(
      buildRepo({
        updateMutation: {
          mutate,
          isPending: false,
        } as unknown as ReturnType<typeof useBrandMetadataRepository>['updateMutation'],
      }),
    );
    render(<MetadataForm brandId="b1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).toHaveBeenCalledWith({ tags: ['en'] }, expect.any(Object));
  });
});
