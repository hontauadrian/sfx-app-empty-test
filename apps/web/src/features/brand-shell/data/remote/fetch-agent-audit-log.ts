import { executeRequest } from '@/features/presentation/networking';
import { agentAuditLogEndpoint } from '../../constants';
import type { AgentAuditLogListDataModel } from '../model/agent-audit-log-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface FetchAgentAuditLogParams {
  readonly clientId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly take?: number;
}

export async function fetchAgentAuditLog(
  brandId: string,
  params: FetchAgentAuditLogParams = {},
): Promise<AgentAuditLogListDataModel> {
  const search = new URLSearchParams();
  if (params.clientId && params.clientId.length > 0) search.set('clientId', params.clientId);
  if (params.from && params.from.length > 0) search.set('from', params.from);
  if (params.to && params.to.length > 0) search.set('to', params.to);
  if (params.take !== undefined) search.set('take', String(params.take));
  const query = search.toString();
  const path = query
    ? `${agentAuditLogEndpoint(brandId)}?${query}`
    : agentAuditLogEndpoint(brandId);
  const response = await executeRequest<ApiEnvelope<AgentAuditLogListDataModel>>({
    path,
  });
  return response.data.data;
}
