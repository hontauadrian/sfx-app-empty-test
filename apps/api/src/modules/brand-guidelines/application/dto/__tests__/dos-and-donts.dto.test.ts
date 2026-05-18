import { describe, expect, it } from 'vitest';
import { DosDontsEntryDto, DosDontsListDto } from '../dos-and-donts.dto';

describe('dos-and-donts DTOs', () => {
  it('DosDontsEntryDto is constructable as a plain object', () => {
    const dto = new DosDontsEntryDto();
    dto.id = 'x';
    dto.brandId = 'b';
    dto.type = 'do';
    dto.category = 'tone';
    dto.ruleText = 'r';
    dto.exampleText = null;
    dto.createdAt = new Date();
    dto.updatedAt = new Date();
    expect(dto.id).toBe('x');
  });

  it('DosDontsListDto carries an items array', () => {
    const list = new DosDontsListDto();
    list.items = [];
    expect(list.items).toEqual([]);
  });
});
