import { describe, expect, it } from 'vitest';
import {
  DOS_AND_DONT_CATEGORY_VALUES,
  DOS_AND_DONT_TYPE_VALUES,
  dosAndDontEditRoute,
  dosAndDontEntryEndpoint,
  dosAndDontEntryQueryKey,
  dosAndDontNewRoute,
  dosAndDontsEndpoint,
  dosAndDontsListQueryKey,
} from '../constants';

describe('dos-and-donts constants', () => {
  it('reexports type and category enums from @sfx/validation', () => {
    expect(DOS_AND_DONT_TYPE_VALUES).toEqual(['do', 'dont']);
    expect(DOS_AND_DONT_CATEGORY_VALUES).toEqual([
      'tone',
      'vocabulary',
      'visuals',
      'legal',
      'campaign-messaging',
    ]);
  });

  it('builds collection and single-entry endpoints', () => {
    expect(dosAndDontsEndpoint('b-1')).toBe('api/v1/brands/b-1/dos-and-donts');
    expect(dosAndDontEntryEndpoint('b-1', 'e-1')).toBe(
      'api/v1/brands/b-1/dos-and-donts/e-1',
    );
  });

  it('returns the 2-tuple list key without a category', () => {
    expect(dosAndDontsListQueryKey('b-1')).toEqual(['dos-and-donts', 'b-1']);
  });

  it('appends the category when present', () => {
    expect(dosAndDontsListQueryKey('b-1', 'tone')).toEqual([
      'dos-and-donts',
      'b-1',
      'tone',
    ]);
  });

  it('returns a 4-tuple entry key', () => {
    expect(dosAndDontEntryQueryKey('b-1', 'e-1')).toEqual([
      'dos-and-donts',
      'b-1',
      'entry',
      'e-1',
    ]);
  });

  it('builds new and edit routes', () => {
    expect(dosAndDontNewRoute('b-1')).toBe('/brands/b-1/dos-and-donts/new');
    expect(dosAndDontEditRoute('b-1', 'e-1')).toBe(
      '/brands/b-1/dos-and-donts/e-1/edit',
    );
  });
});
