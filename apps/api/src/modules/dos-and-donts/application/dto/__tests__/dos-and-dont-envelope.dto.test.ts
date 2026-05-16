import { describe, expect, it } from 'vitest';
import { DosAndDontEnvelopeDto } from '../dos-and-dont-envelope.dto';
import { DosAndDontDto } from '../dos-and-dont.dto';

describe('DosAndDontEnvelopeDto', () => {
  it('instantiates with success+data shape', () => {
    const envelope = new DosAndDontEnvelopeDto();
    const data = new DosAndDontDto();
    Object.assign(data, {
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    envelope.success = true;
    envelope.data = data;
    expect(envelope.success).toBe(true);
    expect(envelope.data.id).toBe('e-1');
  });
});
