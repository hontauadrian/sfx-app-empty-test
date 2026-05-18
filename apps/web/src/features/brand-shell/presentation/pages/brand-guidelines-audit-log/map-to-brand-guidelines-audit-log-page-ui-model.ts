import type { AgentAuditLog } from '@sfx/domain';
import type { AdminBrandGuidelinesAuditLogTranslations } from '@/features/presentation/localization/types';
import type {
  BrandGuidelinesAuditLogPageUIModel,
  BrandGuidelinesAuditLogRowUIModel,
  BrandGuidelinesAuditLogStatus,
} from './types';

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export interface MapToBrandGuidelinesAuditLogPageUIModelInput {
  readonly brandId: string;
  readonly status: BrandGuidelinesAuditLogStatus;
  readonly rows: readonly AgentAuditLog[];
  readonly translations: AdminBrandGuidelinesAuditLogTranslations;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function formatRow(
  row: AgentAuditLog,
  translations: AdminBrandGuidelinesAuditLogTranslations,
): BrandGuidelinesAuditLogRowUIModel {
  const timestampLabel = TIMESTAMP_FORMATTER.format(row.requestTimestamp);
  return {
    id: row.id,
    clientIdLabel: row.clientId,
    endpointLabel: row.endpointPath,
    versionIdLabel: row.versionIdReturned ?? translations.emptyValuePlaceholder,
    statusLabel: String(row.responseStatus),
    timestampLabel,
    ariaLabel: applyTemplate(translations.rowAriaLabelTemplate, {
      clientId: row.clientId,
      endpoint: row.endpointPath,
      timestamp: timestampLabel,
      status: String(row.responseStatus),
    }),
  };
}

export function mapToBrandGuidelinesAuditLogPageUIModel(
  input: MapToBrandGuidelinesAuditLogPageUIModelInput,
): BrandGuidelinesAuditLogPageUIModel {
  const { brandId, status, rows, translations } = input;
  return {
    status,
    title: translations.pageTitle,
    subtitle: translations.subtitle,
    columnHeaders: translations.columnHeaders,
    filters: translations.filters,
    rows: rows.map((row) => formatRow(row, translations)),
    empty: translations.emptyState,
    error: { title: translations.errorTitle, message: translations.errorMessage },
    denied: { title: translations.deniedTitle, message: translations.deniedMessage },
    notFound: { title: translations.notFoundTitle, message: translations.notFoundMessage },
    backToCurrent: {
      label: translations.backToCurrent,
      href: `/admin/brand-guidelines/${brandId}`,
    },
    loadingLabel: translations.loadingLabel,
    emptyValue: translations.emptyValuePlaceholder,
  };
}
