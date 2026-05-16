import { describe, expect, it } from 'vitest';
import type { DosAndDontsCardProps } from '../types';

describe('DosAndDontsCardProps', () => {
  it('accepts a brandId string', () => {
    const props: DosAndDontsCardProps = { brandId: 'b-1' };
    expect(props.brandId).toBe('b-1');
  });
});
