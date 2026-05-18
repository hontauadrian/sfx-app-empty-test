'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useAgentAuditLogRepository } from '../../../data/repositories/use-agent-audit-log-repository';
import {
  mapToBrandGuidelinesAuditLogPageUIModel,
  type MapToBrandGuidelinesAuditLogPageUIModelInput,
} from './map-to-brand-guidelines-audit-log-page-ui-model';
import type {
  BrandGuidelinesAuditLogFilterDraft,
  BrandGuidelinesAuditLogPageUIModel,
  BrandGuidelinesAuditLogStatus,
} from './types';

interface RequestErrorLike {
  readonly status?: number;
}

function deriveStatus(
  isLoading: boolean,
  isError: boolean,
  rawError: unknown,
  hasItems: boolean,
): BrandGuidelinesAuditLogStatus {
  if (isLoading) return 'loading';
  if (isError) {
    const status =
      typeof (rawError as RequestErrorLike)?.status === 'number'
        ? (rawError as RequestErrorLike).status
        : undefined;
    if (status === 403) return 'denied';
    if (status === 404) return 'not-found';
    return 'error';
  }
  return hasItems ? 'ready' : 'empty';
}

export interface UseBrandGuidelinesAuditLogReturn {
  readonly uiModel: BrandGuidelinesAuditLogPageUIModel;
  readonly draft: BrandGuidelinesAuditLogFilterDraft;
  readonly applied: BrandGuidelinesAuditLogFilterDraft;
  readonly setDraftField: (
    field: keyof BrandGuidelinesAuditLogFilterDraft,
    value: string,
  ) => void;
  readonly applyFilters: () => void;
  readonly clearFilters: () => void;
}

const EMPTY_DRAFT: BrandGuidelinesAuditLogFilterDraft = {
  clientId: '',
  from: '',
  to: '',
};

export function useBrandGuidelinesAuditLog(
  brandId: string,
): UseBrandGuidelinesAuditLogReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines.auditLog!;
  const [draft, setDraft] = useState<BrandGuidelinesAuditLogFilterDraft>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<BrandGuidelinesAuditLogFilterDraft>(EMPTY_DRAFT);

  const queryFilters = useMemo(
    () => ({
      clientId: applied.clientId || undefined,
      from: applied.from ? new Date(applied.from).toISOString() : undefined,
      to: applied.to ? new Date(applied.to).toISOString() : undefined,
    }),
    [applied.clientId, applied.from, applied.to],
  );

  const query = useAgentAuditLogRepository(brandId, queryFilters);
  const items = query.data?.items ?? [];
  const status = deriveStatus(
    query.isLoading,
    query.isError,
    query.error,
    items.length > 0,
  );
  const input: MapToBrandGuidelinesAuditLogPageUIModelInput = {
    brandId,
    status,
    rows: items,
    translations: labels,
  };

  const setDraftField = useCallback(
    (field: keyof BrandGuidelinesAuditLogFilterDraft, value: string): void => {
      setDraft((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const applyFilters = useCallback((): void => {
    setApplied(draft);
  }, [draft]);

  const clearFilters = useCallback((): void => {
    setDraft(EMPTY_DRAFT);
    setApplied(EMPTY_DRAFT);
  }, []);

  return {
    uiModel: mapToBrandGuidelinesAuditLogPageUIModel(input),
    draft,
    applied,
    setDraftField,
    applyFilters,
    clearFilters,
  };
}
