import { describe, expect, it } from 'vitest';
import {
  DosAndDontsCard,
  EditDosAndDontPage,
  NewDosAndDontPage,
  dosAndDontEditRoute,
  dosAndDontEntryEndpoint,
  dosAndDontEntryQueryKey,
  dosAndDontNewRoute,
  dosAndDontsEndpoint,
  dosAndDontsListQueryKey,
  useDosAndDontsRepository,
} from '../index';

describe('dos-and-donts feature barrel', () => {
  it('exports all public symbols', () => {
    expect(DosAndDontsCard).toBeDefined();
    expect(EditDosAndDontPage).toBeDefined();
    expect(NewDosAndDontPage).toBeDefined();
    expect(typeof dosAndDontsEndpoint).toBe('function');
    expect(typeof dosAndDontEntryEndpoint).toBe('function');
    expect(typeof dosAndDontsListQueryKey).toBe('function');
    expect(typeof dosAndDontEntryQueryKey).toBe('function');
    expect(typeof dosAndDontNewRoute).toBe('function');
    expect(typeof dosAndDontEditRoute).toBe('function');
    expect(typeof useDosAndDontsRepository).toBe('function');
  });
});
