import { describe, expect, it } from 'vitest';
import * as barrel from '../index';

describe('@/features/visual-identity barrel', () => {
  it('exports the public surface', () => {
    expect(barrel.VisualIdentityCard).toBeDefined();
    expect(barrel.EditVisualIdentityPage).toBeDefined();
    expect(typeof barrel.visualIdentityEndpoint).toBe('function');
    expect(typeof barrel.visualIdentityQueryKey).toBe('function');
    expect(typeof barrel.visualIdentityEditRoute).toBe('function');
  });
});
