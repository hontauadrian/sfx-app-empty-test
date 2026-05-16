import { describe, expect, it } from 'vitest';
import type { AudienceRuleListFieldProps } from '../types';

describe('AudienceRuleListFieldProps', () => {
  it('declares the expected props (type-only)', () => {
    const partial: Pick<AudienceRuleListFieldProps, 'label'> = { label: 'L' };
    expect(partial.label).toBe('L');
  });
});
