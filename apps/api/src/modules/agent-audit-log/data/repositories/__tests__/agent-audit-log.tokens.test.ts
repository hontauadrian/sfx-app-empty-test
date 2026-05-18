import { describe, expect, it } from 'vitest';

import {
  AGENT_AUDIT_LOG_PRISMA_CLIENT,
  AGENT_AUDIT_LOG_REPOSITORY,
} from '../agent-audit-log.tokens';

describe('agent-audit-log.tokens', () => {
  it('AGENT_AUDIT_LOG_PRISMA_CLIENT is a Symbol with a descriptive description', () => {
    expect(typeof AGENT_AUDIT_LOG_PRISMA_CLIENT).toBe('symbol');
    expect(AGENT_AUDIT_LOG_PRISMA_CLIENT.description).toBe('AGENT_AUDIT_LOG_PRISMA_CLIENT');
  });

  it('AGENT_AUDIT_LOG_REPOSITORY is a Symbol with a descriptive description', () => {
    expect(typeof AGENT_AUDIT_LOG_REPOSITORY).toBe('symbol');
    expect(AGENT_AUDIT_LOG_REPOSITORY.description).toBe('AGENT_AUDIT_LOG_REPOSITORY');
  });

  it('tokens are distinct (so DI can resolve them separately)', () => {
    expect(AGENT_AUDIT_LOG_PRISMA_CLIENT).not.toBe(AGENT_AUDIT_LOG_REPOSITORY);
  });
});
