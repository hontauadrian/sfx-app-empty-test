import type {
  CreateDosDontsEntryInput,
  DosDontsEntry,
  UpdateDosDontsEntryInput,
} from '../../entities/dos-donts-entry';
import type { DosDontsRepository } from '../dos-donts-repository';

function buildEntry(overrides: Partial<DosDontsEntry> = {}): DosDontsEntry {
  return {
    id: 'entry-1',
    brandId: 'brand-1',
    type: 'do',
    category: 'tone',
    ruleText: 'Speak warmly',
    exampleText: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DosDontsRepository port', () => {
  it('shape: every CRUD method is implementable with the expected return types', async () => {
    const stub: DosDontsRepository = {
      async listByBrand(brandId, filters) {
        expect(brandId).toBe('brand-1');
        if (filters.type === 'dont') return [];
        return [buildEntry()];
      },
      async findByIdInBrand(brandId, entryId) {
        expect(brandId).toBe('brand-1');
        return entryId === 'entry-1' ? buildEntry() : null;
      },
      async createInBrand(brandId, input: CreateDosDontsEntryInput) {
        return buildEntry({
          brandId,
          type: input.type,
          category: input.category,
          ruleText: input.ruleText,
          exampleText: input.exampleText ?? null,
        });
      },
      async updateInBrandById(brandId, entryId, input: UpdateDosDontsEntryInput) {
        if (entryId !== 'entry-1') return null;
        return buildEntry({
          brandId,
          ruleText: input.ruleText ?? 'Speak warmly',
        });
      },
      async deleteInBrandById(brandId, entryId) {
        expect(brandId).toBe('brand-1');
        return entryId === 'entry-1';
      },
    };

    const list = await stub.listByBrand('brand-1', {});
    expect(list).toHaveLength(1);
    expect(await stub.listByBrand('brand-1', { type: 'dont' })).toEqual([]);
    expect(await stub.findByIdInBrand('brand-1', 'entry-1')).not.toBeNull();
    expect(await stub.findByIdInBrand('brand-1', 'missing')).toBeNull();
    const created = await stub.createInBrand('brand-1', {
      type: 'dont',
      category: 'visuals',
      ruleText: 'No off-palette',
    });
    expect(created.brandId).toBe('brand-1');
    expect(created.exampleText).toBeNull();
    const updated = await stub.updateInBrandById('brand-1', 'entry-1', { ruleText: 'New rule' });
    expect(updated?.ruleText).toBe('New rule');
    expect(await stub.updateInBrandById('brand-1', 'missing', {})).toBeNull();
    expect(await stub.deleteInBrandById('brand-1', 'entry-1')).toBe(true);
    expect(await stub.deleteInBrandById('brand-1', 'missing')).toBe(false);
  });
});
