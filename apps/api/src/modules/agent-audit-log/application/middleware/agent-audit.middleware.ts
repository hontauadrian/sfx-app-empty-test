import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type {
  AgentAuditLogRepository,
  CreateAgentAuditLogInput,
} from '@sfx/domain';
import { AUTH_ROLE_AGENT } from '@sfx/shared';
import { AGENT_AUDIT_LOG_REPOSITORY } from '../../data/repositories/agent-audit-log.tokens';
import type { RequestWithAuthenticatedUser } from '../../../../common/guards/jwt-auth.guard';

interface ResponseWithCapturedBody extends Response {
  __agentAuditCapturedBody?: unknown;
}

// HTTP middleware that records every agent-authenticated request to the
// agent_audit_log table. Registered globally; only audits requests whose
// authenticated user carries the `agent` role.
//
// Uses res.on('finish') instead of an interceptor's tap() so we audit
// requests rejected by JwtAuthGuard (403/401 from missing role) as well as
// successful responses. The JwtAuthGuard binds request.user before its role
// check so the rejection path still has a user we can attribute.
//
// To capture versionId from response bodies, we monkey-patch res.json so the
// JSON envelope is preserved; the audit record uses it on finish.
@Injectable()
export class AgentAuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AgentAuditMiddleware.name);

  constructor(
    @Inject(AGENT_AUDIT_LOG_REPOSITORY)
    private readonly repository: AgentAuditLogRepository,
  ) {}

  use(request: RequestWithAuthenticatedUser, response: Response, next: NextFunction): void {
    const requestTimestamp = new Date();
    const responseWithBody = response as ResponseWithCapturedBody;
    const originalJson = response.json.bind(response);
    response.json = (body: unknown): Response => {
      responseWithBody.__agentAuditCapturedBody = body;
      return originalJson(body);
    };

    response.on('finish', () => {
      const user = request.user;
      if (!user || !user.roles.includes(AUTH_ROLE_AGENT)) {
        return;
      }
      const payload: CreateAgentAuditLogInput = {
        requestId: pickRequestId(request),
        clientId: pickClientId(user, request),
        endpointPath: pickEndpointPath(request),
        brandId: pickBrandId(request),
        versionIdReturned: pickVersionId(responseWithBody.__agentAuditCapturedBody),
        requestTimestamp,
        responseStatus: response.statusCode,
      };
      void this.repository.create(payload).catch((err) => {
        this.logger.error('Failed to record agent audit log row', err as Error);
      });
    });

    next();
  }
}

function pickRequestId(request: Request): string {
  const headerValue = request.headers['x-request-id'];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return randomUUID();
}

function pickClientId(
  user: NonNullable<RequestWithAuthenticatedUser['user']>,
  request: Request,
): string {
  const headerValue = request.headers['x-client-id'];
  const headerClient = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof headerClient === 'string' && headerClient.trim().length > 0) {
    return headerClient.trim();
  }
  return user.email ?? user.subject;
}

function pickEndpointPath(request: Request): string {
  return request.originalUrl ?? request.url ?? '';
}

function pickBrandId(request: Request): string | null {
  const params = (request.params as Record<string, string> | undefined) ?? {};
  const brandId = params.brandId ?? params.id;
  if (typeof brandId === 'string' && brandId.length > 0) {
    return brandId;
  }
  // Fall back to parsing /brands/<id>/... from the URL when route params have
  // not been populated yet (middleware runs before the router resolves them).
  const url = pickEndpointPath(request);
  const match = url.match(/\/brands\/([^/?]+)/);
  return match?.[1] ?? null;
}

function pickVersionId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const direct = readVersionIdField(root);
  if (direct) return direct;
  const data = root.data;
  if (data && typeof data === 'object') {
    return readVersionIdField(data as Record<string, unknown>);
  }
  return null;
}

function readVersionIdField(record: Record<string, unknown>): string | null {
  const direct = record.versionId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const latest = record.latestVersionId;
  if (typeof latest === 'string' && latest.length > 0) return latest;
  const id = record.id;
  if (typeof id === 'string' && id.startsWith('clxbgv')) return id;
  return null;
}
