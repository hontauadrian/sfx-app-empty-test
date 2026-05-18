import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentAuditLogModule } from '../agent-audit-log.module';
import { AgentAuditMiddleware } from '../application/middleware/agent-audit.middleware';
import { AGENT_AUDIT_LOG_REPOSITORY } from '../data/repositories/agent-audit-log.tokens';

describe('AgentAuditLogModule', () => {
  it('resolves the repository token + the audit middleware', async () => {
    process.env.OAUTH_ISSUER_URL ??= 'http://localhost:37385/realms/app';
    process.env.OAUTH_JWKS_URL ??=
      'http://localhost:37385/realms/app/protocol/openid-connect/certs';
    process.env.OAUTH_API_CLIENT_ID ??= 'test-client';
    process.env.JWT_SECRET ??= 'integration-test-secret-key-32chars';

    const moduleRef = await Test.createTestingModule({
      imports: [AgentAuditLogModule],
    }).compile();

    expect(moduleRef.get(AGENT_AUDIT_LOG_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(AgentAuditMiddleware)).toBeInstanceOf(AgentAuditMiddleware);
    await moduleRef.close();
  });
});
