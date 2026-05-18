import type { BaseSyntheticEvent } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { UpsertCompanyInfoInput } from '@sfx/domain';

export type CompanyInfoFormValues = {
  legalName: string;
  tradingName: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  companyName: string | null;
  industry: string | null;
  foundedYear: number | null;
  teamSize: number | null;
  missionStatement: string | null;
  visionStatement: string | null;
  coreValues: string[];
  certifications: string[];
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
};

export type CompanyInfoFieldName = keyof CompanyInfoFormValues;

export type CompanyInfoFieldInputType = 'text' | 'email' | 'url' | 'tel' | 'number' | 'textarea' | 'array';

export interface CompanyInfoFieldUIModel {
  readonly name: CompanyInfoFieldName;
  readonly label: string;
  readonly placeholder: string;
  readonly type: CompanyInfoFieldInputType;
  readonly required: boolean;
}

export type CompanyInfoSectionKey = 'legalRegistration' | 'identity' | 'keyFacts' | 'contact';

export interface CompanyInfoSectionUIModel {
  readonly key: CompanyInfoSectionKey;
  readonly title: string;
  readonly fields: readonly CompanyInfoFieldUIModel[];
}

export type CompanyInfoPageStatus = 'loading' | 'denied' | 'ready';

export interface CompanyInfoSubmitUIModel {
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
}

export interface CompanyInfoDeniedUIModel {
  readonly title: string;
  readonly message: string;
  readonly backToHomeLabel: string;
  readonly backToHomeHref: string;
}

export interface CompanyInfoViewHistoryUIModel {
  readonly label: string;
  readonly href: string;
}

export interface CompanyInfoPageUIModel {
  readonly status: CompanyInfoPageStatus;
  readonly title: string;
  readonly sections: readonly CompanyInfoSectionUIModel[];
  readonly submit: CompanyInfoSubmitUIModel;
  readonly denied: CompanyInfoDeniedUIModel;
  readonly viewHistory: CompanyInfoViewHistoryUIModel;
}

export interface UseCompanyInfoReturn {
  readonly uiModel: CompanyInfoPageUIModel;
  readonly form: UseFormReturn<CompanyInfoFormValues>;
  readonly handleSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
}

export type CompanyInfoSubmitPayload = UpsertCompanyInfoInput;
