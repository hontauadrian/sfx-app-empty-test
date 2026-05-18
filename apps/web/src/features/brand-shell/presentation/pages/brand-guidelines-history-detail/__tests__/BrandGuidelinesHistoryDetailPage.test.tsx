import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { BrandGuidelinesVersion } from '@sfx/domain';

vi.mock('../use-brand-guidelines-history-detail', () => ({
  useBrandGuidelinesHistoryDetail: vi.fn(),
}));

import { useBrandGuidelinesHistoryDetail } from '../use-brand-guidelines-history-detail';
import { BrandGuidelinesHistoryDetailPage } from '../index';
import type { BrandGuidelinesHistoryDetailPageUIModel } from '../types';

const useHookMock = vi.mocked(useBrandGuidelinesHistoryDetail);

const EMPTY = '—';
const READONLY = ' (read-only)';

function baseUiModel(
  overrides: Partial<BrandGuidelinesHistoryDetailPageUIModel> = {},
): BrandGuidelinesHistoryDetailPageUIModel {
  return {
    status: 'ready',
    title: 'Version snapshot',
    banner: { message: 'Read-only — version saved by admin at 2026-05-17. Note: —' },
    sections: [],
    backToCurrent: { label: 'Back to current', href: '/admin/brand-guidelines/b-1' },
    denied: { title: 'Denied', message: 'No access' },
    notFound: { title: 'Not found', message: 'No version' },
    error: { title: 'Error', message: 'Try again' },
    readOnlyAriaSuffix: READONLY,
    emptyValuePlaceholder: EMPTY,
    ...overrides,
  };
}

const populatedSections: BrandGuidelinesHistoryDetailPageUIModel['sections'] = [
  {
    key: 'voice',
    title: 'Brand Voice',
    data: {
      tone: 'Bold and confident',
      preferredVocabulary: ['craft', 'partner'],
      restrictedVocabulary: ['cheap'],
    } as unknown as BrandGuidelinesVersion['snapshot']['voice'],
  },
  {
    key: 'visual',
    title: 'Visual Identity',
    data: { logoUsage: 'Clear space on all sides' } as unknown as BrandGuidelinesVersion['snapshot']['visual'],
  },
  {
    key: 'dosAndDonts',
    title: "Dos & Don'ts",
    data: [
      { id: 'e1', type: 'do', category: 'tone', ruleText: 'Be direct' },
      { id: 'e2', type: 'dont', category: 'tone', ruleText: 'No jargon' },
    ] as unknown as BrandGuidelinesVersion['snapshot']['dosAndDonts'],
  },
  {
    key: 'metadata',
    title: 'Metadata',
    data: { tags: ['en', 'launch'] } as unknown as BrandGuidelinesVersion['snapshot']['metadata'],
  },
];

const emptySections: BrandGuidelinesHistoryDetailPageUIModel['sections'] = [
  { key: 'voice', title: 'Brand Voice', data: null },
  { key: 'visual', title: 'Visual Identity', data: null },
  { key: 'dosAndDonts', title: "Dos & Don'ts", data: [] },
  { key: 'metadata', title: 'Metadata', data: null },
];

describe('BrandGuidelinesHistoryDetailPage', () => {
  it('renders the loading state with the page title as polite live region', () => {
    useHookMock.mockReturnValue({ uiModel: baseUiModel({ status: 'loading', sections: [] }) });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Version snapshot');
  });

  it('renders the denied alert', () => {
    useHookMock.mockReturnValue({ uiModel: baseUiModel({ status: 'denied', sections: [] }) });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);
    expect(screen.getByTestId('brand-guidelines-history-detail-denied')).toHaveTextContent(
      'No access',
    );
  });

  it('renders the not-found alert', () => {
    useHookMock.mockReturnValue({ uiModel: baseUiModel({ status: 'not-found', sections: [] }) });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);
    expect(screen.getByTestId('brand-guidelines-history-detail-not-found')).toHaveTextContent(
      'No version',
    );
  });

  it('renders the error alert', () => {
    useHookMock.mockReturnValue({ uiModel: baseUiModel({ status: 'error', sections: [] }) });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);
    expect(screen.getByTestId('brand-guidelines-history-detail-error')).toHaveTextContent(
      'Try again',
    );
  });

  it('renders the back link to the current brand guidelines page', () => {
    useHookMock.mockReturnValue({ uiModel: baseUiModel() });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);
    const link = screen.getByTestId('brand-guidelines-history-detail-back-link');
    expect(link).toHaveAttribute('href', '/admin/brand-guidelines/b-1');
    expect(link).toHaveTextContent('Back to current');
  });

  it('renders four populated sections with read-only inputs in ready state', () => {
    useHookMock.mockReturnValue({ uiModel: baseUiModel({ sections: populatedSections }) });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);

    expect(screen.getByTestId('brand-guidelines-history-detail-banner')).toHaveTextContent(
      'Read-only',
    );

    const voiceSection = screen.getByTestId('brand-guidelines-history-detail-section-voice');
    const tone = within(voiceSection).getByLabelText(`Tone${READONLY}`) as HTMLTextAreaElement;
    expect(tone).toHaveValue('Bold and confident');
    expect(tone).toBeDisabled();
    expect(tone).toHaveAttribute('readonly');
    expect(within(voiceSection).getByText('craft, partner')).toBeInTheDocument();
    expect(within(voiceSection).getByText('cheap')).toBeInTheDocument();

    const visualSection = screen.getByTestId('brand-guidelines-history-detail-section-visual');
    const logo = within(visualSection).getByLabelText(`Logo usage${READONLY}`) as HTMLTextAreaElement;
    expect(logo).toHaveValue('Clear space on all sides');

    const dosSection = screen.getByTestId('brand-guidelines-history-detail-section-dosAndDonts');
    const dosItems = within(dosSection).getAllByRole('listitem');
    expect(dosItems).toHaveLength(2);
    expect(within(dosItems[0]!).getByLabelText(`do: tone${READONLY}`)).toHaveValue('Be direct');
    expect(within(dosItems[1]!).getByLabelText(`dont: tone${READONLY}`)).toHaveValue('No jargon');

    const metaSection = screen.getByTestId('brand-guidelines-history-detail-section-metadata');
    expect(within(metaSection).getByLabelText(`Tags${READONLY}`)).toHaveValue('en, launch');
  });

  it('renders empty placeholders when every section data is empty', () => {
    useHookMock.mockReturnValue({ uiModel: baseUiModel({ sections: emptySections }) });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);

    for (const key of ['voice', 'visual', 'dosAndDonts', 'metadata'] as const) {
      const section = screen.getByTestId(`brand-guidelines-history-detail-section-${key}`);
      expect(within(section).getByText(EMPTY)).toBeInTheDocument();
    }
  });

  it('shows the empty placeholder inside the tags input when tags array is empty (metadata present, no tags)', () => {
    const uiModel = baseUiModel({
      sections: [
        { key: 'voice', title: 'Brand Voice', data: null },
        { key: 'visual', title: 'Visual Identity', data: null },
        { key: 'dosAndDonts', title: "Dos & Don'ts", data: [] },
        {
          key: 'metadata',
          title: 'Metadata',
          data: { tags: [] } as unknown as BrandGuidelinesVersion['snapshot']['metadata'],
        },
      ],
    });
    useHookMock.mockReturnValue({ uiModel });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);
    const metaSection = screen.getByTestId('brand-guidelines-history-detail-section-metadata');
    const tagsInput = within(metaSection).getByLabelText(`Tags${READONLY}`) as HTMLInputElement;
    expect(tagsInput).toHaveValue(EMPTY);
  });

  it('shows the empty placeholder inside vocabulary lists when those arrays are empty (voice present, lists empty)', () => {
    const uiModel = baseUiModel({
      sections: [
        {
          key: 'voice',
          title: 'Brand Voice',
          data: {
            tone: 'Calm',
            preferredVocabulary: [],
            restrictedVocabulary: [],
          } as unknown as BrandGuidelinesVersion['snapshot']['voice'],
        },
        { key: 'visual', title: 'Visual Identity', data: null },
        { key: 'dosAndDonts', title: "Dos & Don'ts", data: [] },
        { key: 'metadata', title: 'Metadata', data: null },
      ],
    });
    useHookMock.mockReturnValue({ uiModel });
    render(<BrandGuidelinesHistoryDetailPage brandId="b-1" versionId="v-1" />);
    const voiceSection = screen.getByTestId('brand-guidelines-history-detail-section-voice');
    // Tone present + two empty-placeholder dd elements rendered (preferred + restricted).
    expect(within(voiceSection).getByLabelText(`Tone${READONLY}`)).toHaveValue('Calm');
    expect(within(voiceSection).getAllByText(EMPTY)).toHaveLength(2);
  });
});
