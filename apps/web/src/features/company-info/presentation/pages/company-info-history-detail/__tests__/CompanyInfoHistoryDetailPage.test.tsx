import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CompanyInfoFieldName } from '../../company-info/types';

vi.mock('../use-company-info-history-detail', () => ({
  useCompanyInfoHistoryDetail: vi.fn(),
}));

import { useCompanyInfoHistoryDetail } from '../use-company-info-history-detail';
import { CompanyInfoHistoryDetailPage } from '../index';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import type {
  CompanyInfoHistoryDetailFieldUIModel,
  CompanyInfoHistoryDetailPageUIModel,
} from '../types';

const useCompanyInfoHistoryDetailMock = vi.mocked(useCompanyInfoHistoryDetail);

function field(
  name: CompanyInfoFieldName,
  label: string,
  text: string,
  type: CompanyInfoHistoryDetailFieldUIModel['type'] = 'text',
): CompanyInfoHistoryDetailFieldUIModel {
  return { name, label, type, value: { kind: type === 'textarea' ? 'multiline' : 'scalar', text } };
}

function arrayField(
  name: CompanyInfoFieldName,
  label: string,
  items: readonly string[],
): CompanyInfoHistoryDetailFieldUIModel {
  return {
    name,
    label,
    type: 'array',
    value: { kind: 'array', items, emptyText: enCommon.adminCompanyInfo.historyDetail.emptyValuePlaceholder },
  };
}

function baseReadyUi(): CompanyInfoHistoryDetailPageUIModel {
  return {
    status: 'ready',
    title: enCommon.adminCompanyInfo.historyDetail.pageTitle,
    readOnlyAriaSuffix: enCommon.adminCompanyInfo.historyDetail.readOnlyAriaSuffix,
    banner: { message: 'Read-only — version saved by Ada Lovelace at Jun 2, 2024, 10:00 AM' },
    sections: [
      {
        key: 'legalRegistration',
        title: enCommon.adminCompanyInfo.sections.legalRegistration,
        fields: [
          field('legalName', enCommon.adminCompanyInfo.fields.legalName.label, 'Acme Holdings SRL'),
          field('tradingName', enCommon.adminCompanyInfo.fields.tradingName.label, 'Acme'),
          field('taxId', enCommon.adminCompanyInfo.fields.taxId.label, '—'),
          field(
            'registrationNumber',
            enCommon.adminCompanyInfo.fields.registrationNumber.label,
            '—',
          ),
        ],
      },
      {
        key: 'identity',
        title: enCommon.adminCompanyInfo.sections.identity,
        fields: [
          field('companyName', enCommon.adminCompanyInfo.fields.companyName.label, '—'),
          field('industry', enCommon.adminCompanyInfo.fields.industry.label, 'Manufacturing'),
          field('foundedYear', enCommon.adminCompanyInfo.fields.foundedYear.label, '1998', 'number'),
          field('teamSize', enCommon.adminCompanyInfo.fields.teamSize.label, '42', 'number'),
        ],
      },
      {
        key: 'keyFacts',
        title: enCommon.adminCompanyInfo.sections.keyFacts,
        fields: [
          field(
            'missionStatement',
            enCommon.adminCompanyInfo.fields.missionStatement.label,
            'Build great things',
            'textarea',
          ),
          field(
            'visionStatement',
            enCommon.adminCompanyInfo.fields.visionStatement.label,
            '—',
            'textarea',
          ),
          arrayField('coreValues', enCommon.adminCompanyInfo.fields.coreValues.label, ['Integrity', 'Craft', 'Honesty']),
          arrayField('certifications', enCommon.adminCompanyInfo.fields.certifications.label, []),
        ],
      },
      {
        key: 'contact',
        title: enCommon.adminCompanyInfo.sections.contact,
        fields: [
          field('email', enCommon.adminCompanyInfo.fields.email.label, 'contact@acme.test', 'email'),
          field('phone', enCommon.adminCompanyInfo.fields.phone.label, '—', 'tel'),
          field('website', enCommon.adminCompanyInfo.fields.website.label, '—', 'url'),
          field('addressLine1', enCommon.adminCompanyInfo.fields.addressLine1.label, '—'),
          field('addressLine2', enCommon.adminCompanyInfo.fields.addressLine2.label, '—'),
          field('city', enCommon.adminCompanyInfo.fields.city.label, '—'),
          field('postalCode', enCommon.adminCompanyInfo.fields.postalCode.label, '—'),
          field('country', enCommon.adminCompanyInfo.fields.country.label, '—'),
        ],
      },
    ],
    backToCurrent: {
      label: enCommon.adminCompanyInfo.historyDetail.backToCurrent,
      href: '/admin/company-info',
    },
    denied: {
      title: enCommon.admin.denied.title,
      message: enCommon.admin.denied.message,
      backToHomeLabel: enCommon.admin.denied.backToHome,
      backToHomeHref: '/',
    },
    notFound: {
      title: enCommon.adminCompanyInfo.historyDetail.notFoundTitle,
      message: enCommon.adminCompanyInfo.historyDetail.notFoundMessage,
    },
    error: {
      title: enCommon.adminCompanyInfo.historyDetail.errorTitle,
      message: enCommon.adminCompanyInfo.historyDetail.errorMessage,
    },
  };
}

beforeEach(() => {
  useCompanyInfoHistoryDetailMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CompanyInfoHistoryDetailPage', () => {
  it('renders the banner with editor + timestamp', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({ uiModel: baseReadyUi() });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Read-only');
    expect(banner).toHaveTextContent('Ada Lovelace');
  });

  it('renders all 20 fields as disabled + aria-disabled inputs/textareas', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({ uiModel: baseReadyUi() });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    const legalName = screen.getByLabelText(new RegExp(enCommon.adminCompanyInfo.fields.legalName.label));
    expect(legalName).toBeDisabled();
    expect(legalName).toHaveAttribute('aria-disabled', 'true');
    expect(legalName).toHaveAttribute('readonly');

    const mission = screen.getByLabelText(
      new RegExp(enCommon.adminCompanyInfo.fields.missionStatement.label),
    );
    expect(mission.tagName.toLowerCase()).toBe('textarea');
    expect(mission).toBeDisabled();
    expect(mission).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders an array field as a read-only list with one entry per value (no add/remove)', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({ uiModel: baseReadyUi() });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    const lists = screen.getAllByRole('list');
    expect(lists.length).toBeGreaterThan(0);
    const coreValuesList = lists.find((list) => within(list).queryByDisplayValue('Integrity'));
    expect(coreValuesList).toBeDefined();
    const items = coreValuesList ? within(coreValuesList).getAllByRole('listitem') : [];
    expect(items).toHaveLength(3);
    expect(within(coreValuesList!).queryByRole('button', { name: /add/i })).toBeNull();
    expect(within(coreValuesList!).queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('does not render a submit button', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({ uiModel: baseReadyUi() });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });

  it('renders a back-to-current link pointing to /admin/company-info', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({ uiModel: baseReadyUi() });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    const link = screen.getByRole('link', {
      name: enCommon.adminCompanyInfo.historyDetail.backToCurrent,
    });
    expect(link).toHaveAttribute('href', '/admin/company-info');
  });

  it('renders the not-found surface when status="not-found"', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({
      uiModel: { ...baseReadyUi(), status: 'not-found' },
    });
    render(<CompanyInfoHistoryDetailPage versionId="missing" />);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: enCommon.adminCompanyInfo.historyDetail.notFoundTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: enCommon.adminCompanyInfo.historyDetail.backToCurrent })).toHaveAttribute(
      'href',
      '/admin/company-info',
    );
  });

  it('renders the denied surface when status="denied"', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({
      uiModel: { ...baseReadyUi(), status: 'denied' },
    });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    expect(
      screen.getByRole('heading', { level: 1, name: enCommon.admin.denied.title }),
    ).toBeInTheDocument();
  });

  it('renders the error surface when status="error"', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({
      uiModel: { ...baseReadyUi(), status: 'error' },
    });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders a skeleton main with aria-busy when status="loading"', () => {
    useCompanyInfoHistoryDetailMock.mockReturnValue({
      uiModel: { ...baseReadyUi(), status: 'loading' },
    });
    render(<CompanyInfoHistoryDetailPage versionId="v-1" />);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('aria-busy', 'true');
  });
});
