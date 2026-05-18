import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ListAgentAuditLogQueryPipe } from '../list-agent-audit-log-query.pipe';

describe('ListAgentAuditLogQueryPipe', () => {
  const pipe = new ListAgentAuditLogQueryPipe();

  it('passes empty query (all filters optional)', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('coerces take from string to number', () => {
    const result = pipe.transform({ take: '25' }) as { take: number };
    expect(result.take).toBe(25);
  });

  it('preserves clientId + ISO dates', () => {
    const result = pipe.transform({
      clientId: 'brand-reader-agent',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-18T23:59:59.999Z',
    }) as { clientId: string; from: string; to: string };
    expect(result.clientId).toBe('brand-reader-agent');
    expect(result.from).toBe('2026-05-01T00:00:00.000Z');
    expect(result.to).toBe('2026-05-18T23:59:59.999Z');
  });

  it('coerces invalid date strings to undefined (probe-sentinel safe)', () => {
    const result = pipe.transform({ from: 'not-a-date' }) as { from?: string };
    expect(result.from).toBeUndefined();
  });

  it('throws BadRequestException when from > to', () => {
    expect(() =>
      pipe.transform({
        from: '2026-05-18T00:00:00.000Z',
        to: '2026-05-01T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException for unknown fields (strict)', () => {
    expect(() => pipe.transform({ extra: 'x' })).toThrow(BadRequestException);
  });
});
