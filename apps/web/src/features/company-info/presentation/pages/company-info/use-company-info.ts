'use client';

import { useCallback, useEffect, useRef, type BaseSyntheticEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import type { CompanyInfo, UpsertCompanyInfoInput } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast';
import { AUTH_SESSION_QUERY_KEY } from '@/features/auth/constants';
import type { RequestError } from '@/features/presentation/networking';
import { useCompanyInfoRepository } from '../../../data/repositories/use-company-info-repository';
import { upsertCompanyInfoResolver } from '../../validators/upsert-company-info.resolver';
import { mapToCompanyInfoPageUIModel } from './map-to-company-info-page-ui-model';
import type {
  CompanyInfoFieldName,
  CompanyInfoFormValues,
  UseCompanyInfoReturn,
} from './types';

function emptyDefaults(): CompanyInfoFormValues {
  return {
    legalName: '',
    tradingName: null,
    taxId: null,
    registrationNumber: null,
    companyName: null,
    industry: null,
    foundedYear: null,
    teamSize: null,
    missionStatement: null,
    visionStatement: null,
    coreValues: [],
    certifications: [],
    email: null,
    phone: null,
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
  };
}

function toFormValues(record: CompanyInfo): CompanyInfoFormValues {
  return {
    legalName: record.legalName,
    tradingName: record.tradingName,
    taxId: record.taxId,
    registrationNumber: record.registrationNumber,
    companyName: record.companyName,
    industry: record.industry,
    foundedYear: record.foundedYear,
    teamSize: record.teamSize,
    missionStatement: record.missionStatement,
    visionStatement: record.visionStatement,
    coreValues: [...record.coreValues],
    certifications: [...record.certifications],
    email: record.email,
    phone: record.phone,
    website: record.website,
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    city: record.city,
    postalCode: record.postalCode,
    country: record.country,
  };
}

function normalizeString(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  return value.trim() === '' ? null : value;
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStringArray(value: readonly string[] | null | undefined): string[] {
  if (!value) return [];
  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function valuesForSubmit(values: CompanyInfoFormValues): UpsertCompanyInfoInput {
  return {
    legalName: values.legalName,
    tradingName: normalizeString(values.tradingName),
    taxId: normalizeString(values.taxId),
    registrationNumber: normalizeString(values.registrationNumber),
    companyName: normalizeString(values.companyName),
    industry: normalizeString(values.industry),
    foundedYear: normalizeNumber(values.foundedYear),
    teamSize: normalizeNumber(values.teamSize),
    missionStatement: normalizeString(values.missionStatement),
    visionStatement: normalizeString(values.visionStatement),
    coreValues: normalizeStringArray(values.coreValues),
    certifications: normalizeStringArray(values.certifications),
    email: normalizeString(values.email),
    phone: normalizeString(values.phone),
    website: normalizeString(values.website),
    addressLine1: normalizeString(values.addressLine1),
    addressLine2: normalizeString(values.addressLine2),
    city: normalizeString(values.city),
    postalCode: normalizeString(values.postalCode),
    country: normalizeString(values.country),
  };
}

function extractStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as RequestError).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

function extractFieldErrors(error: unknown): RequestError['errors'] | undefined {
  if (error && typeof error === 'object' && 'errors' in error) {
    return (error as RequestError).errors;
  }
  return undefined;
}

const COMPANY_INFO_FIELD_NAMES: ReadonlySet<CompanyInfoFieldName> = new Set([
  'legalName',
  'tradingName',
  'email',
  'phone',
  'website',
  'addressLine1',
  'addressLine2',
  'city',
  'postalCode',
  'country',
  'taxId',
  'registrationNumber',
]);

function isCompanyInfoFieldName(value: string): value is CompanyInfoFieldName {
  return COMPANY_INFO_FIELD_NAMES.has(value as CompanyInfoFieldName);
}

export function useCompanyInfo(): UseCompanyInfoReturn {
  const translations = useTranslations('common');
  const { success: pushSuccess, error: pushError } = useToast();
  const queryClient = useQueryClient();
  const { companyInfoQuery, upsertMutation } = useCompanyInfoRepository();

  const form = useForm<CompanyInfoFormValues>({
    resolver: upsertCompanyInfoResolver,
    defaultValues: emptyDefaults(),
  });

  const record = companyInfoQuery.data ?? null;
  const lastResetSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!record) return;
    const signature = `${record.id}::${record.updatedAt.toISOString()}`;
    if (lastResetSignatureRef.current === signature) return;
    lastResetSignatureRef.current = signature;
    form.reset(toFormValues(record));
  }, [record, form]);

  const isDenied = extractStatus(companyInfoQuery.error) === 403;

  const uiModel = mapToCompanyInfoPageUIModel({
    translations,
    record,
    isLoading: companyInfoQuery.isLoading,
    isDenied,
    isPending: upsertMutation.isPending,
  });

  const onValid = useCallback(
    async (values: CompanyInfoFormValues): Promise<void> => {
      try {
        const saved = await upsertMutation.mutateAsync(valuesForSubmit(values));
        pushSuccess(translations.adminCompanyInfo.toast.success);
        form.reset(toFormValues(saved));
      } catch (caught) {
        const status = extractStatus(caught);
        const fieldErrors = extractFieldErrors(caught);

        if (status === 400 && fieldErrors && fieldErrors.length > 0) {
          for (const issue of fieldErrors) {
            if (isCompanyInfoFieldName(issue.field)) {
              form.setError(issue.field, { type: 'server', message: issue.message });
            }
          }
          return;
        }

        if (status === 401) {
          await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
          pushError(translations.adminCompanyInfo.toast.authError);
          return;
        }

        if (status === 403) {
          pushError(translations.adminCompanyInfo.toast.authError);
          return;
        }

        pushError(translations.adminCompanyInfo.toast.unexpectedError);
      }
    },
    [upsertMutation, form, pushSuccess, pushError, queryClient, translations],
  );

  const handleSubmit = useCallback(
    async (event?: BaseSyntheticEvent): Promise<void> => {
      const cleanArray = (name: 'coreValues' | 'certifications'): void => {
        const current = (form.getValues(name) ?? []) as readonly string[];
        const cleaned = current.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
        const changed =
          cleaned.length !== current.length || cleaned.some((entry, i) => entry !== current[i]);
        if (changed) {
          form.setValue(name, cleaned, { shouldDirty: true });
        }
      };
      cleanArray('coreValues');
      cleanArray('certifications');
      await form.handleSubmit(onValid)(event);
    },
    [form, onValid],
  );

  return { uiModel, form, handleSubmit };
}
