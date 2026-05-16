import { describe, expect, it } from 'vitest';
import { DosAndDontListEnvelopeDto } from '../dos-and-dont-list-envelope.dto';

describe('DosAndDontListEnvelopeDto', () => {
  it('instantiates with success+data array shape', () => {
    const envelope = new DosAndDontListEnvelopeDto();
    envelope.success = true;
    envelope.data = [];
    expect(envelope.success).toBe(true);
    expect(Array.isArray(envelope.data)).toBe(true);
  });
});
