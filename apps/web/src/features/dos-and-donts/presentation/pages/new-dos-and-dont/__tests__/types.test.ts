import { describe, expect, it } from 'vitest';
import type { NewDosAndDontPageProps } from '../types';

describe('NewDosAndDontPageProps', () => {
  it('accepts a brandId', () => {
    const props: NewDosAndDontPageProps = { brandId: 'b-1' };
    expect(props.brandId).toBe('b-1');
  });
});
