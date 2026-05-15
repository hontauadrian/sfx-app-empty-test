import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BrandOverviewPage } from '..';

const useBrandOverviewMock = vi.fn();

vi.mock('../use-brand-overview', () => ({
  useBrandOverview: (...args: unknown[]): unknown => useBrandOverviewMock(...args),
}));

const baseUI = {
  brandName: 'Acme',
  isLoading: false,
  hasError: false,
  notFound: false,
  errorLabel: 'Error',
  settingsLabel: 'Brand settings',
  renameLabel: 'Rename',
  deleteLabel: 'Delete brand',
  brandVoiceTitle: 'Brand voice',
  brandVoiceCtaLabel: '+ Edit brand voice',
  brandVoiceCtaHref: '/brands/brand-1/voice/edit',
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

  it('renders the header, both section placeholders and their CTAs', () => {
    (useBrandOverviewMock as Mock).mockReturnValue(baseHook());
    render(<BrandOverviewPage brandId="brand-1" />);
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Edit brand voice' })).toHaveAttribute(
      'href',
      '/brands/brand-1/voice/edit',
    );
    expect(screen.getByRole('link', { name: '+ Edit visual identity' })).toHaveAttribute(
      'href',
      '/brands/brand-1/visual-identity/edit',
    );
  });

  it('renders the 404 state when the API reports the brand is missing', () => {
    (useBrandOverviewMock as Mock).mockReturnValue(
      baseHook({ uiModel: { ...baseUI, notFound: true } }),
    );
    render(<BrandOverviewPage brandId="brand-1" />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('opens the rename modal when the menu entry is chosen', async () => {
    const openRename = vi.fn();
    (useBrandOverviewMock as Mock).mockReturnValue(baseHook({ openRename }));
    const user = userEvent.setup();
    render(<BrandOverviewPage brandId="brand-1" />);
    await user.click(screen.getByRole('button', { name: 'Brand settings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(openRename).toHaveBeenCalledTimes(1);
  });

  it('renders the rename modal when its flag is set', () => {
    (useBrandOverviewMock as Mock).mockReturnValue(baseHook({ isRenameOpen: true }));
    render(<BrandOverviewPage brandId="brand-1" />);
    expect(screen.getByRole('dialog', { name: 'Rename brand' })).toBeInTheDocument();
  });
});
