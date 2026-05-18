import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { AgentAuditLogDto, AgentAuditLogListDto } from '../agent-audit-log.dto';

describe('AgentAuditLogDto', () => {
  it('instantiates and holds every field as a plain property', () => {
    const dto = new AgentAuditLogDto();
    dto.id = 'aud-1';
    dto.requestId = 'req-1';
    dto.clientId = 'agent-1';
    dto.endpointPath = '/api/v1/brands/brand-1/guidelines/voice';
    dto.brandId = 'brand-1';
    dto.versionIdReturned = 'v-1';
    dto.requestTimestamp = new Date('2026-05-18T10:00:00.000Z');
    dto.responseStatus = 200;
    expect(dto.id).toBe('aud-1');
    expect(dto.responseStatus).toBe(200);
    expect(dto.brandId).toBe('brand-1');
  });

  it('accepts null brandId + versionIdReturned', () => {
    const dto = new AgentAuditLogDto();
    dto.brandId = null;
    dto.versionIdReturned = null;
    expect(dto.brandId).toBeNull();
    expect(dto.versionIdReturned).toBeNull();
  });
});

describe('AgentAuditLogListDto', () => {
  it('holds an items array', () => {
    const dto = new AgentAuditLogListDto();
    dto.items = [];
    expect(dto.items.length).toBe(0);
  });
});
