import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AudienceRuleDto } from '../audience-rule.dto';

describe('AudienceRuleDto', () => {
  it('instantiates and accepts the documented fields', () => {
    const dto = new AudienceRuleDto();
    dto.audience = 'Gen Z';
    dto.rule = 'Speak peer-to-peer.';
    expect(dto.audience).toBe('Gen Z');
    expect(dto.rule).toBe('Speak peer-to-peer.');
  });
});
