import { describe, expect, it } from 'vitest';
import { DosAndDontsModule } from '../dos-and-donts.module';
import { DosAndDontController } from '../application/controllers/dos-and-dont.controller';
import { DosAndDontRepository } from '../data/repositories/dos-and-dont.repository';

describe('DosAndDontsModule', () => {
  it('is a class referenced by name', () => {
    expect(typeof DosAndDontsModule).toBe('function');
    expect(DosAndDontsModule.name).toBe('DosAndDontsModule');
  });

  it('co-located controller and repository are exported and importable', () => {
    expect(typeof DosAndDontController).toBe('function');
    expect(typeof DosAndDontRepository).toBe('function');
  });
});
