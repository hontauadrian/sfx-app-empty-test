'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AgentAuditLog } from '@sfx/domain';
import { agentAuditLogQueryKey, type AgentAuditLogFilterState } from '../../constants';
import { fetchAgentAuditLog } from '../remote/fetch-agent-audit-log';
import { mapToAgentAuditLogList } from '../mapper/map-to-agent-audit-log';
import type { AgentAuditLogListDataModel } from '../model/agent-audit-log-data-model';

export interface UseAgentAuditLogRepositoryInput extends AgentAuditLogFilterState {
  readonly take?: number;
}

export type UseAgentAuditLogRepositoryReturn = UseQueryResult<{
  readonly items: readonly AgentAuditLog[];
}>;

export function useAgentAuditLogRepository(
  brandId: string,
  input: UseAgentAuditLogRepositoryInput = {},
): UseAgentAuditLogRepositoryReturn {
  const filters: AgentAuditLogFilterState = {
    clientId: input.clientId,
    from: input.from,
    to: input.to,
  };
  return useQuery({
    queryKey: [...agentAuditLogQueryKey(brandId, filters), input.take ?? null],
    queryFn: (): Promise<AgentAuditLogListDataModel> =>
      fetchAgentAuditLog(brandId, { ...filters, take: input.take }),
    select: (data: AgentAuditLogListDataModel) => mapToAgentAuditLogList(data),
    enabled: brandId.length > 0,
    retry: false,
  });
}
