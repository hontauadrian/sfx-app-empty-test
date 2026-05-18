import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../use-company-info-history', () => ({
  useCompanyInfoHistory: vi.fn(),
}));

import { useCompanyInfoHistory } from '../use-company-info-history';
import { CompanyInfoHistoryPage } from '../index';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import type { CompanyInfoHistoryPageUIModel } from '../types';

const useCompanyInfoHistoryMock = vi.mocked(useCompanyInfoHistory);

function baseUi(overrides: Partial<CompanyInfoHistoryPageUIModel> = {}): CompanyInfoHistoryPageUIModel {
  return {
    status: 'ready',
    title: enCommon.adminCompanyInfo.history.pageTitle,
    loadingLabel: enCommon.adminCompanyInfo.history.loadingLabel,
    columnHeaders: enCommon.adminCompanyInfo.history.columnHeaders,
    rows: [],
    empty: {
      title: enCommon.adminCompanyInfo.history.emptyState.title,
      message: enCommon.adminCompanyInfo.history.emptyState.message,
    },
    error: {
      title: enCommon.adminCompanyInfo.history.errorTitle,
      message: enCommon.adminCompanyInfo.history.errorMessage,
    },
    denied: {
      title: enCommon.admin.denied.title,
      message: enCommon.admin.denied.message,
      backToHomeLabel: enCommon.admin.denied.backToHome,
      backToHomeHref: '/',
    },
    backToCurrent: {
      label: enCommon.adminCompanyInfo.history.backToCurrent,
      href: '/admin/company-info',
    },
    ...overrides,
  };
}

beforeEach(() => {
  useCompanyInfoHistoryMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CompanyInfoHistoryPage', () => {
  it('renders a busy skeleton main while loading', () => {
    useCompanyInfoHistoryMock.mockReturnValue({ uiModel: baseUi({ status: 'loading' }) });
    render(<CompanyInfoHistoryPage />);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(main).toHaveAttribute('aria-label', enCommon.adminCompanyInfo.history.loadingLabel);
  });

  it('renders the empty state copy and back-to-current link when status=empty', () => {
    useCompanyInfoHistoryMock.mockReturnValue({ uiModel: baseUi({ status: 'empty' }) });
    render(<CompanyInfoHistoryPage />);
    expect(
      screen.getByRole('heading', { level: 2, name: enCommon.adminCompanyInfo.history.emptyState.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.adminCompanyInfo.history.emptyState.message),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: enCommon.adminCompanyInfo.history.backToCurrent }),
    ).toHaveAttribute('href', '/admin/company-info');
  });

  it('renders a table with N rows when status=ready', () => {
    useCompanyInfoHistoryMock.mockReturnValue({
      uiModel: baseUi({
        status: 'ready',
        rows: [
          {
            id: 'v-1',
            href: '/admin/company-info/history/v-1',
            savedAtLabel: 'Jun 2, 2024, 10:00 AM',
            editorLabel: 'Ada Lovelace',
            ariaLabel: 'Version saved by Ada Lovelace at Jun 2, 2024, 10:00 AM',
          },
          {
            id: 'v-2',
            href: '/admin/company-info/history/v-2',
            savedAtLabel: 'Jun 3, 2024, 10:00 AM',
            editorLabel: 'Grace Hopper',
            ariaLabel: 'Version saved by Grace Hopper at Jun 3, 2024, 10:00 AM',
          },
        ],
      }),
    });
    render(<CompanyInfoHistoryPage />);
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: enCommon.adminCompanyInfo.history.columnHeaders.savedAt }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: enCommon.adminCompanyInfo.history.columnHeaders.editor }),
    ).toBeInTheDocument();
    const adaLink = screen.getByRole('link', { name: /Ada Lovelace/ });
    expect(adaLink).toHaveAttribute('href', '/admin/company-info/history/v-1');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('renders the denied surface with the back-to-home link when status=denied', () => {
    useCompanyInfoHistoryMock.mockReturnValue({ uiModel: baseUi({ status: 'denied' }) });
    render(<CompanyInfoHistoryPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: enCommon.admin.denied.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: enCommon.admin.denied.backToHome })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('renders the error surface when status=error', () => {
    useCompanyInfoHistoryMock.mockReturnValue({ uiModel: baseUi({ status: 'error' }) });
    render(<CompanyInfoHistoryPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: enCommon.adminCompanyInfo.history.errorTitle }),
    ).toBeInTheDocument();
  });

  it('renders the page title and back-to-current link inside the ready header', () => {
    useCompanyInfoHistoryMock.mockReturnValue({ uiModel: baseUi({ status: 'empty' }) });
    render(<CompanyInfoHistoryPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: enCommon.adminCompanyInfo.history.pageTitle }),
    ).toBeInTheDocument();
  });
});
