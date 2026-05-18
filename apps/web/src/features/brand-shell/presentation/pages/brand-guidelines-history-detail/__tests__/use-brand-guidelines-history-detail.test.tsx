import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization';

vi.mock('../../../../data/remote/fetch-brand-guidelines-version-by-id', () => ({
  fetchBrandGuidelinesVersionById: vi.fn(),
}));

import { fetchBrandGuidelinesVersionById } from '../../../../data/remote/fetch-brand-guidelines-version-by-id';
import { useBrandGuidelinesHistoryDetail } from '../use-brand-guidelines-history-detail';

const fetchMock = vi.mocked(fetchBrandGuidelinesVersionById);

function wrapperFactory(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return (
      <LanguageProvider defaultLanguage="en">
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </LanguageProvider>
    );
  };
}

afterEach(() => fetchMock.mockReset());

const sampleDto = {
  id: 'v-1',
  brandId: 'b-1',
  snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
  editorUserId: 'u-1',
  editorDisplayName: 'admin@example.com',
  changeNote: 'tone tighten',
  createdAt: '2026-05-17T10:30:00.000Z',
};

const populatedDto: import('../../../../data/model/brand-guidelines-version-data-model').BrandGuidelinesVersionDataModel = {
  id: 'v-2',
  brandId: 'b-1',
  snapshot: {
    voice: {
      brandId: 'b-1',
      tone: 'Bold',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [],
      writingStyleRules: '',
      audienceRules: [],
      approvedExamples: [],
      rejectedExamples: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    },
    visual: {
      brandId: 'b-1',
      logoUsage: 'Default',
      colorPalette: [],
      typography: [],
      spacingGuidance: '',
      imageStyleGuidance: '',
      iconographyGuidance: '',
      usageRestrictions: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    },
    dosAndDonts: [
      {
        id: 'dd-1',
        brandId: 'b-1',
        type: 'do' as const,
        category: 'tone',
        ruleText: 'Be concise',
        exampleText: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    ],
    metadata: {
      brandId: 'b-1',
      ownerUserId: 'u-1',
      lastUpdatedAt: '2026-05-17T00:00:00.000Z',
      lastUpdatedByUserId: 'u-1',
      tags: ['launch'],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    },
  },
  editorUserId: 'u-1',
  editorDisplayName: 'admin@example.com',
  changeNote: null,
  createdAt: '2026-05-17T10:30:00.000Z',
};

describe('useBrandGuidelinesHistoryDetail', () => {
  it('returns ready uiModel with banner when version loads', async () => {
    fetchMock.mockResolvedValueOnce(sampleDto);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesHistoryDetail('b-1', 'v-1'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    expect(result.current.uiModel.banner.message).toContain('admin@example.com');
    expect(result.current.uiModel.banner.message).toContain('tone tighten');
    expect(result.current.uiModel.sections).toHaveLength(4);
  });

  it('returns not-found uiModel on 404', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesHistoryDetail('b-1', 'v-x'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('not-found'));
  });

  it('returns denied uiModel on 403', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesHistoryDetail('b-1', 'v-1'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('denied'));
  });

  it('returns error uiModel on generic failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesHistoryDetail('b-1', 'v-1'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('error'));
  });

  it('renders four populated sections when every sub-resource has data', async () => {
    fetchMock.mockResolvedValueOnce(populatedDto);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesHistoryDetail('b-1', 'v-2'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    expect(result.current.uiModel.sections).toHaveLength(4);
    expect(result.current.uiModel.sections.map((s) => s.key)).toEqual([
      'voice',
      'visual',
      'dosAndDonts',
      'metadata',
    ]);
    // Each section now carries the snapshot sub-resource as data (rendering
    // is the page's responsibility) — assert the data was forwarded.
    for (const section of result.current.uiModel.sections) {
      expect(section.data).not.toBeNull();
    }
  });
});
