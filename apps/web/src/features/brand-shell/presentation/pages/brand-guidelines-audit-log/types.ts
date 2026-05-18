export type BrandGuidelinesAuditLogStatus =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'denied'
  | 'not-found'
  | 'error';

export interface BrandGuidelinesAuditLogRowUIModel {
  readonly id: string;
  readonly clientIdLabel: string;
  readonly endpointLabel: string;
  readonly versionIdLabel: string;
  readonly statusLabel: string;
  readonly timestampLabel: string;
  readonly ariaLabel: string;
}

export interface BrandGuidelinesAuditLogColumnHeadersUIModel {
  readonly clientId: string;
  readonly endpoint: string;
  readonly versionId: string;
  readonly status: string;
  readonly requestTimestamp: string;
}

export interface BrandGuidelinesAuditLogFiltersUIModel {
  readonly clientIdLabel: string;
  readonly clientIdPlaceholder: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly applyCta: string;
  readonly clearCta: string;
}

export interface BrandGuidelinesAuditLogFeedbackUIModel {
  readonly title: string;
  readonly message: string;
}

export interface BrandGuidelinesAuditLogBackLinkUIModel {
  readonly label: string;
  readonly href: string;
}

export interface BrandGuidelinesAuditLogPageUIModel {
  readonly status: BrandGuidelinesAuditLogStatus;
  readonly title: string;
  readonly subtitle: string;
  readonly columnHeaders: BrandGuidelinesAuditLogColumnHeadersUIModel;
  readonly filters: BrandGuidelinesAuditLogFiltersUIModel;
  readonly rows: readonly BrandGuidelinesAuditLogRowUIModel[];
  readonly empty: BrandGuidelinesAuditLogFeedbackUIModel;
  readonly error: BrandGuidelinesAuditLogFeedbackUIModel;
  readonly denied: BrandGuidelinesAuditLogFeedbackUIModel;
  readonly notFound: BrandGuidelinesAuditLogFeedbackUIModel;
  readonly backToCurrent: BrandGuidelinesAuditLogBackLinkUIModel;
  readonly loadingLabel: string;
  readonly emptyValue: string;
}

export interface BrandGuidelinesAuditLogPageProps {
  readonly brandId: string;
}

export interface BrandGuidelinesAuditLogFilterDraft {
  readonly clientId: string;
  readonly from: string;
  readonly to: string;
}
