import { describe, expect, it } from 'vitest';
import { DosAndDontWriteDto } from '../dos-and-dont-write.dto';

describe('DosAndDontWriteDto', () => {
  it('instantiates with the declared shape', () => {
    const dto = new DosAndDontWriteDto();
    Object.assign(dto, {
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
    });
    expect(dto.title).toBe('t');
    expect(dto.suggestedCorrection).toBeNull();
  });
});
