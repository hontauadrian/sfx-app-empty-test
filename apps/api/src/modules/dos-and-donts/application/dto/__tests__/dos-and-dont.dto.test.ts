import { describe, expect, it } from 'vitest';
import { DosAndDontDto } from '../dos-and-dont.dto';

describe('DosAndDontDto', () => {
  it('instantiates with the declared property shape', () => {
    const dto = new DosAndDontDto();
    Object.assign(dto, {
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
    expect(dto.id).toBe('e-1');
    expect(dto.suggestedCorrection).toBeNull();
  });
});
