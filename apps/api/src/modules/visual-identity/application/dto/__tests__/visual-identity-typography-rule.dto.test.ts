import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { VisualIdentityTypographyRuleDto } from '../visual-identity-typography-rule.dto';

describe('VisualIdentityTypographyRuleDto', () => {
  it('accepts a fully-populated rule', () => {
    const dto = new VisualIdentityTypographyRuleDto();
    dto.role = 'Display';
    dto.family = 'Inter';
    dto.weight = '700';
    dto.size = '48px';
    dto.notes = 'Hero headings.';
    expect(dto.role).toBe('Display');
    expect(dto.size).toBe('48px');
  });

  it('allows null optionals', () => {
    const dto = new VisualIdentityTypographyRuleDto();
    dto.role = 'Body';
    dto.family = 'Inter';
    dto.weight = null;
    dto.size = null;
    dto.notes = null;
    expect(dto.weight).toBeNull();
  });
});
