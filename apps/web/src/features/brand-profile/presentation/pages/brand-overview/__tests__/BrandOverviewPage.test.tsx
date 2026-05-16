import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BrandOverviewPage } from '..';

const useBrandOverviewMock = vi.fn();

vi.mock('../use-brand-overview', () => ({
  useBrandOverview: (...args: unknown[]): unknown => useBrandOverviewMock(...args),
}));

vi.mock('@/features/brand-voice/data/remote/fetch-brand-voice', () => ({
  fetchBrandVoice: vi.fn().mockResolvedValue({
    brandProfileId: 'brand-1',
    toneOfVoice: null,
    preferredVocabulary: [],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: [],
    audienceRules: [],
    approvedExamplePhrases: [],
    rejectedExamplePhrases: [],
    createdAt: null,
    updatedAt: null,
  }),
}));

vi.mock('@/features/visual-identity/data/remote/fetch-visual-identity', () => ({
  fetchVisualIdentity: vi.fn().mockResolvedValue({
    id: '',
    brandId: 'brand-1',
    logoUsageRules: null,
    colourPalette: [],
    typographyRules: [],
    spacingLayoutGuidance: null,
    imageStyleGuidance: null,
    iconographyGuidance: null,
    usageRestrictions: null,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  }),
}));

vi.mock('@/features/dos-and-donts/data/remote/fetch-dos-and-donts', () => ({
  fetchDosAndDonts: vi.fn().mockResolvedValue([]),
}));

import { LanguageProvider } from '@/features/presentation/localization';

function withClient(ui: ReactNode): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{ui}</LanguageProvider>
    </QueryClientProvider>
  );
}

const baseUI = {
  brandName: 'Acme',
  isLoading: false,
  hasError: false,
  notFound: false,
  errorLabel: 'Error',
  settingsLabel: 'Brand settings',
  renameLabel: 'Rename',
  deleteLabel: 'Delete brand',
  visualIdentityTitle: 'Visual identity',
  visualIdentityCtaLabel: '+ Edit visual identity',
  visualIdentityCtaHref: '/brands/brand-1/visual-identity/edit',
  renameModalTitle: 'Rename brand',
  renameSubmitLabel: 'Save',
  renameCancelLabel: 'Cancel',
  renameNameLabel: 'Brand name',
  renameNameRequiredError: 'Required',
  renameNameTooLongError: 'Too long',
  deleteModalTitle: 'Delete brand',
  deleteModalBody: 'Are you sure?',
  deleteConfirmLabel: 'Delete',
  deleteCancelLabel: 'Cancel',
};

interface HookShape {
  uiModel: typeof baseUI;
  isRenameOpen: boolean;
  isDeleteOpen: boolean;
  isRenaming: boolean;
  isDeleting: boolean;
  initialName: string;
  openRename: ReturnType<typeof vi.fn>;
  closeRename: ReturnType<typeof vi.fn>;
  openDelete: ReturnType<typeof vi.fn>;
  closeDelete: ReturnType<typeof vi.fn>;
  handleRenameSubmit: ReturnType<typeof vi.fn>;
  handleDeleteConfirm: ReturnType<typeof vi.fn>;
}

function buildHook(): HookShape {
  return {
    uiModel: baseUI,
    isRenameOpen: false,
    isDeleteOpen: false,
    isRenaming: false,
    isDeleting: false,
    initialName: 'Acme',
    openRename: vi.fn(),
    closeRename: vi.fn(),
    openDelete: vi.fn(),
    closeDelete: vi.fn(),
    handleRenameSubmit: vi.fn().mockResolvedValue(undefined),
    handleDeleteConfirm: vi.fn().mockResolvedValue(undefined),
  };
}

function baseHook(overrides: Partial<HookShape> = {}): HookShape {
  return { ...buildHook(), ...overrides };
}

describe('BrandOverviewPage', () => {
  beforeEach(() => {
    useBrandOverviewMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header, the BrandVoiceCard, and the visual-identity CTA', async () => {
    (useBrandOverviewMock as Mock).mockReturnValue(baseHook());
    render(withClient(<BrandOverviewPage brandId="brand-1" />));
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: '+ Edit brand voice' }),
      ).toHaveAttribute('href', '/brands/brand-1/voice/edit'),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: '+ Edit visual identity' }),
      ).toHaveAttribute('href', '/brands/brand-1/visual-identity/edit'),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: "Dos & Don'ts" }),
      ).toBeInTheDocument(),
    );
  });

  it('renders the 404 state when the API reports the brand is missing', () => {
    (useBrandOverviewMock as Mock).mockReturnValue(
      baseHook({ uiModel: { ...baseUI, notFound: true } }),
    );
    render(withClient(<BrandOverviewPage brandId="brand-1" />));
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('opens the rename modal when the menu entry is chosen', async () => {
    const openRename = vi.fn();
    (useBrandOverviewMock as Mock).mockReturnValue(baseHook({ openRename }));
    const user = userEvent.setup();
    render(withClient(<BrandOverviewPage brandId="brand-1" />));
    await user.click(screen.getByRole('button', { name: 'Brand settings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(openRename).toHaveBeenCalledTimes(1);
  });

  it('renders the rename modal when its flag is set', () => {
    (useBrandOverviewMock as Mock).mockReturnValue(baseHook({ isRenameOpen: true }));
    render(withClient(<BrandOverviewPage brandId="brand-1" />));
    expect(screen.getByRole('dialog', { name: 'Rename brand' })).toBeInTheDocument();
  });
});
