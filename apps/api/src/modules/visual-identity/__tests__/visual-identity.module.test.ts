import { describe, expect, it } from 'vitest';
import { VisualIdentityModule } from '../visual-identity.module';
import { VisualIdentityController } from '../application/controllers/visual-identity.controller';
import { VisualIdentityRepository } from '../data/repositories/visual-identity.repository';

describe('VisualIdentityModule', () => {
  it('is a class that can be referenced by name', () => {
    expect(typeof VisualIdentityModule).toBe('function');
    expect(VisualIdentityModule.name).toBe('VisualIdentityModule');
  });

  it('co-located controller and repository classes are exported and importable', () => {
    expect(typeof VisualIdentityController).toBe('function');
    expect(typeof VisualIdentityRepository).toBe('function');
  });
});
