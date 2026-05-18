import { describe, expect, it } from 'vitest';
import type { AdminBrandGuidelinesAuditLogTranslations } from '@/features/presentation/localization/types';

import { mapToBrandGuidelinesAuditLogPageUIModel } from '../map-to-brand-guidelines-audit-log-page-ui-model';

const TRANSLATIONS: AdminBrandGuidelinesAuditLogTranslations = {
  pageTitle: 'Agent audit log',
  subtitle: 'subtitle',
  viewAuditLogCta: 'View audit log',
  backToCurrent: 'Back to current',
  columnHeaders: {
    clientId: 'Client',
    endpoint: 'Endpoint',
    versionId: 'Version',
    status: 'Status',
    requestTimestamp: 'Time',
  },
  filters: {
    clientIdLabel: 'Client',
    clientIdPlaceholder: 'Filter…',
    fromLabel: 'From',
    toLabel: 'To',
    applyCta: 'Apply',
    clearCta: 'Clear',
  },
  emptyState: { title: 'empty', message: 'msg' },
  loadingLabel: 'Loading…',
  errorTitle: 'error',
  errorMessage: 'msg',
  deniedTitle: 'denied',
  deniedMessage: 'msg',
  notFoundTitle: 'not found',
  notFoundMessage: 'msg',
  rowAriaLabelTemplate: '{clientId} called {endpoint} at {timestamp} ({status})',
  emptyValuePlaceholder: '—',
};

describe('mapToBrandGuidelinesAuditLogPageUIModel', () => {
  it('formats rows with the timestamp formatter + aria template', () => {
    const ui = mapToBrandGuidelinesAuditLogPageUIModel({
      brandId: 'brand-1',
      status: 'ready',
      rows: [
        {
          id: 'aud-1',
          requestId: 'req-1',
          clientId: 'agent-1',
          endpointPath: '/api/v1/brands',
          brandId: null,
          versionIdReturned: null,
          requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
          responseStatus: 200,
        },
      ],
      translations: TRANSLATIONS,
    });
    expect(ui.rows.length).toBe(1);
    const row = ui.rows[0]!;
    expect(row.clientIdLabel).toBe('agent-1');
    expect(row.endpointLabel).toBe('/api/v1/brands');
    expect(row.versionIdLabel).toBe('—');
    expect(row.statusLabel).toBe('200');
    expect(row.ariaLabel).toContain('agent-1 called /api/v1/brands at');
    expect(row.ariaLabel).toContain('(200)');
  });

  it('passes versionIdReturned through when present', () => {
    const ui = mapToBrandGuidelinesAuditLogPageUIModel({
      brandId: 'brand-1',
      status: 'ready',
      rows: [
        {
          id: 'aud-2',
          requestId: 'req-2',
          clientId: 'agent-2',
          endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
          brandId: 'brand-1',
          versionIdReturned: 'v-1',
          requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
          responseStatus: 200,
        },
      ],
      translations: TRANSLATIONS,
    });
    expect(ui.rows[0]?.versionIdLabel).toBe('v-1');
  });

  it('passes status + feedback maps through', () => {
    const ui = mapToBrandGuidelinesAuditLogPageUIModel({
      brandId: 'brand-1',
      status: 'denied',
      rows: [],
      translations: TRANSLATIONS,
    });
    expect(ui.status).toBe('denied');
    expect(ui.backToCurrent.href).toBe('/admin/brand-guidelines/brand-1');
    expect(ui.denied.title).toBe('denied');
  });
});
