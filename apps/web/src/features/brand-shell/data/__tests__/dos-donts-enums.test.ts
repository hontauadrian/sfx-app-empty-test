import { describe, expect, it } from 'vitest';
import {
  DOS_DONTS_CATEGORIES,
  DOS_DONTS_TYPES,
  GUIDELINE_SEARCH_SECTIONS,
} from '../dos-donts-enums';

describe('brand-shell dos-donts-enums mirror', () => {
  it('mirrors the type tuple verbatim', () => {
    expect(DOS_DONTS_TYPES).toEqual(['do', 'dont']);
  });

  it('mirrors the category tuple verbatim', () => {
    expect(DOS_DONTS_CATEGORIES).toEqual([
      'tone',
      'vocabulary',
      'visuals',
      'legal',
      'campaign-messaging',
    ]);
  });

  it('mirrors the search section tuple verbatim', () => {
    expect(GUIDELINE_SEARCH_SECTIONS).toEqual([
      'voice',
      'visual',
      'dos-and-donts',
      'metadata',
    ]);
  });
});
