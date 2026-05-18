import type {
  CompanyInfoDeniedUIModel,
  CompanyInfoFieldName,
  CompanyInfoFieldUIModel,
  CompanyInfoSectionKey,
} from '../company-info/types';

export type CompanyInfoHistoryDetailStatus =
  | 'loading'
  | 'ready'
  | 'denied'
  | 'not-found'
  | 'error';

export type CompanyInfoHistoryDetailFieldValue =
  | { readonly kind: 'scalar'; readonly text: string }
  | { readonly kind: 'multiline'; readonly text: string }
  | { readonly kind: 'array'; readonly items: readonly string[]; readonly emptyText: string };

export interface CompanyInfoHistoryDetailFieldUIModel {
  readonly name: CompanyInfoFieldName;
  readonly label: string;
  readonly type: CompanyInfoFieldUIModel['type'];
  readonly value: CompanyInfoHistoryDetailFieldValue;
}

export interface CompanyInfoHistoryDetailSectionUIModel {
  readonly key: CompanyInfoSectionKey;
  readonly title: string;
  readonly fields: readonly CompanyInfoHistoryDetailFieldUIModel[];
}

export interface CompanyInfoHistoryDetailBannerUIModel {
  readonly message: string;
}

export interface CompanyInfoHistoryDetailBackToCurrentUIModel {
  readonly label: string;
  readonly href: string;
}

export interface CompanyInfoHistoryDetailNotFoundUIModel {
  readonly title: string;
  readonly message: string;
}

export interface CompanyInfoHistoryDetailErrorUIModel {
  readonly title: string;
  readonly message: string;
}

export interface CompanyInfoHistoryDetailPageUIModel {
  readonly status: CompanyInfoHistoryDetailStatus;
  readonly title: string;
  readonly readOnlyAriaSuffix: string;
  readonly banner: CompanyInfoHistoryDetailBannerUIModel;
  readonly sections: readonly CompanyInfoHistoryDetailSectionUIModel[];
  readonly backToCurrent: CompanyInfoHistoryDetailBackToCurrentUIModel;
  readonly denied: CompanyInfoDeniedUIModel;
  readonly notFound: CompanyInfoHistoryDetailNotFoundUIModel;
  readonly error: CompanyInfoHistoryDetailErrorUIModel;
}

export interface UseCompanyInfoHistoryDetailInput {
  readonly versionId: string;
}

export interface UseCompanyInfoHistoryDetailReturn {
  readonly uiModel: CompanyInfoHistoryDetailPageUIModel;
}
