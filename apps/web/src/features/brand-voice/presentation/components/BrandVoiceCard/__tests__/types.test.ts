import { describe, expect, it } from 'vitest';
import type { BrandVoiceCardProps } from '../types';

describe('BrandVoiceCardProps', () => {
  it('accepts a brandId', () => {
    const props: BrandVoiceCardProps = { brandId: 'b-1' };
    expect(props.brandId).toBe('b-1');
  });
});
