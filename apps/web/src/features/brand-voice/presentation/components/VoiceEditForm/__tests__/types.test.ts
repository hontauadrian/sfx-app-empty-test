import { describe, expect, it } from 'vitest';
import type { VoiceEditFormProps } from '../types';

describe('VoiceEditFormProps', () => {
  it('declares the expected props (type-only)', () => {
    const partial: Pick<VoiceEditFormProps, 'saveLabel'> = { saveLabel: 'S' };
    expect(partial.saveLabel).toBe('S');
  });
});
