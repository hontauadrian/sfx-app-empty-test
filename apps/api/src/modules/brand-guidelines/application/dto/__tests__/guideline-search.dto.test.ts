import { describe, expect, it } from 'vitest';
import {
  GuidelineSearchGroupDto,
  GuidelineSearchItemDto,
  GuidelineSearchResponseDto,
} from '../guideline-search.dto';

describe('guideline-search DTOs', () => {
  it('all three DTOs are constructable as plain objects', () => {
    const item = new GuidelineSearchItemDto();
    item.id = 'x';
    item.sectionTitleKey = 'k';
    item.matchedFieldKey = 'k';
    item.fragment = 'frag';
    item.href = '/h';

    const group = new GuidelineSearchGroupDto();
    group.section = 'dos-and-donts';
    group.items = [item];

    const response = new GuidelineSearchResponseDto();
    response.query = 'q';
    response.brandId = 'b';
    response.groups = [group];

    expect(response.groups[0]?.items[0]?.fragment).toBe('frag');
  });
});
