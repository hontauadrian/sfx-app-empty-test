import { describe, expect, it } from 'vitest';
import type { VisualIdentityCardProps } from '../types';

describe('VisualIdentityCardProps', () => {
  it('carries the brand id', () => {
    const props: VisualIdentityCardProps = { brandId: 'brand-1' };
    expect(props.brandId).toBe('brand-1');
  });
});
