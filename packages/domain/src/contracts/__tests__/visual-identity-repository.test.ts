import { describe, expect, it } from 'vitest';
import {
  VISUAL_IDENTITY_REPOSITORY,
  type IVisualIdentityRepository,
  type VisualIdentityWritePayload,
} from '../visual-identity-repository';
import type { VisualIdentity } from '../../entities/visual-identity';

describe('IVisualIdentityRepository', () => {
  it('exposes a unique DI symbol', () => {
    expect(typeof VISUAL_IDENTITY_REPOSITORY).toBe('symbol');
    expect(VISUAL_IDENTITY_REPOSITORY.description).toBe('VISUAL_IDENTITY_REPOSITORY');
  });

  it('contract can be implemented by an in-memory class', async () => {
    class Stub implements IVisualIdentityRepository {
      private store = new Map<string, VisualIdentity>();
      async findByBrand(brandId: string): Promise<VisualIdentity | null> {
        return this.store.get(brandId) ?? null;
      }
      async upsertForBrand(
        brandId: string,
        _owner: string,
        payload: VisualIdentityWritePayload,
      ): Promise<VisualIdentity | null> {
        const next: VisualIdentity = {
          id: 'vi-1',
          brandId,
          logoUsageRules: payload.logoUsageRules,
          colourPalette: payload.colourPalette,
          typographyRules: payload.typographyRules,
          spacingLayoutGuidance: payload.spacingLayoutGuidance,
          imageStyleGuidance: payload.imageStyleGuidance,
          iconographyGuidance: payload.iconographyGuidance,
          usageRestrictions: payload.usageRestrictions,
          createdAt: null,
          updatedAt: null,
        };
        this.store.set(brandId, next);
        return next;
      }
    }
    const repo = new Stub();
    const created = await repo.upsertForBrand('brand-1', 'admin', {
      logoUsageRules: 'rules',
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
    });
    expect(created?.brandId).toBe('brand-1');
    const fetched = await repo.findByBrand('brand-1', 'admin');
    expect(fetched?.logoUsageRules).toBe('rules');
  });
});
