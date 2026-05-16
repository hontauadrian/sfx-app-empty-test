import { describe, expect, it } from 'vitest';
import type { EditDosAndDontPageProps } from '../types';

describe('EditDosAndDontPageProps', () => {
  it('accepts brandId and entryId', () => {
    const props: EditDosAndDontPageProps = { brandId: 'b-1', entryId: 'e-1' };
    expect(props.entryId).toBe('e-1');
  });
});
