import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../data/repositories/use-dos-and-donts-repository', () => ({
  useDosAndDontsRepository: vi.fn(),
}));

import { useDosAndDontsRepository } from '../../../../data/repositories/use-dos-and-donts-repository';
import { LanguageProvider } from '@/features/presentation/localization';
import { DosAndDontsList } from '../index';

const useDosAndDontsRepositoryMock = vi.mocked(useDosAndDontsRepository);

function buildRepository(
  overrides: Partial<ReturnType<typeof useDosAndDontsRepository>> = {},
): ReturnType<typeof useDosAndDontsRepository> {
  return {
    listQuery: { data: [], isSuccess: true, isLoading: false } as unknown as ReturnType<
      typeof useDosAndDontsRepository
    >['listQuery'],
    createMutation: {
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDosAndDontsRepository>['createMutation'],
    updateMutation: {
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDosAndDontsRepository>['updateMutation'],
    deleteMutation: {
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDosAndDontsRepository>['deleteMutation'],
    ...overrides,
  } as ReturnType<typeof useDosAndDontsRepository>;
}

function Wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );
}

describe('DosAndDontsList', () => {
  it('renders empty state when no entries', () => {
    useDosAndDontsRepositoryMock.mockReturnValue(buildRepository());
    render(<DosAndDontsList brandId="b1" />, { wrapper: Wrapper });
    expect(screen.getByText('No rules yet')).toBeInTheDocument();
  });

  it('opens the inline editor when add CTA is clicked', () => {
    useDosAndDontsRepositoryMock.mockReturnValue(buildRepository());
    render(<DosAndDontsList brandId="b1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Add entry/ }));
    expect(screen.getByTestId('dos-donts-row-editor')).toBeInTheDocument();
  });

  it('renders entries with type and category labels', () => {
    useDosAndDontsRepositoryMock.mockReturnValue(
      buildRepository({
        listQuery: {
          data: [
            {
              id: 'dd1',
              brandId: 'b1',
              type: 'dont' as const,
              category: 'legal' as const,
              ruleText: 'No copyrighted assets.',
              exampleText: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          isSuccess: true,
          isLoading: false,
        } as unknown as ReturnType<typeof useDosAndDontsRepository>['listQuery'],
      }),
    );
    render(<DosAndDontsList brandId="b1" />, { wrapper: Wrapper });
    expect(screen.getByText('No copyrighted assets.')).toBeInTheDocument();
    const row = screen.getByTestId('dos-donts-row-dd1');
    expect(within(row).getByText("Don't")).toBeInTheDocument();
    expect(within(row).getByText('Legal')).toBeInTheDocument();
  });

  it('opens the delete dialog when delete clicked, then confirms', () => {
    const deleteMutate = vi.fn();
    useDosAndDontsRepositoryMock.mockReturnValue(
      buildRepository({
        listQuery: {
          data: [
            {
              id: 'dd1',
              brandId: 'b1',
              type: 'do' as const,
              category: 'tone' as const,
              ruleText: 'rule',
              exampleText: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          isSuccess: true,
          isLoading: false,
        } as unknown as ReturnType<typeof useDosAndDontsRepository>['listQuery'],
        deleteMutation: {
          mutate: deleteMutate,
          isPending: false,
        } as unknown as ReturnType<typeof useDosAndDontsRepository>['deleteMutation'],
      }),
    );
    render(<DosAndDontsList brandId="b1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(deleteMutate).toHaveBeenCalledWith({ entryId: 'dd1' }, expect.any(Object));
  });
});
