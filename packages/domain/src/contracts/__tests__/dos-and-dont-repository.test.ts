import { describe, expect, it } from 'vitest';
import {
  DOS_AND_DONT_REPOSITORY,
  type DosAndDontCreateInput,
  type DosAndDontListFilter,
  type DosAndDontUpdatePatch,
  type IDosAndDontRepository,
} from '../dos-and-dont-repository';
import type { DosAndDontEntry } from '../../entities/dos-and-dont-entry';

describe('dos-and-dont-repository contract', () => {
  it('exposes a unique DI symbol', () => {
    expect(typeof DOS_AND_DONT_REPOSITORY).toBe('symbol');
    expect(DOS_AND_DONT_REPOSITORY.description).toBe('DOS_AND_DONT_REPOSITORY');
    expect(DOS_AND_DONT_REPOSITORY).not.toBe(Symbol('DOS_AND_DONT_REPOSITORY'));
  });

  it('declares listByBrand / findById / create / update / delete', () => {
    const now = new Date('2026-05-15T00:00:00.000Z');
    const sample: DosAndDontEntry = {
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
      createdAt: now,
      updatedAt: now,
    };
    const filter: DosAndDontListFilter = { category: 'tone' };
    const create: DosAndDontCreateInput = {
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
    };
    const patch: DosAndDontUpdatePatch = {
      type: 'dont',
      category: 'legal',
      title: 't2',
      body: 'b2',
      suggestedCorrection: 'fix',
    };
    const stub: IDosAndDontRepository = {
      async listByBrand() {
        return [sample];
      },
      async findById() {
        return sample;
      },
      async create() {
        return sample;
      },
      async update() {
        return sample;
      },
      async delete() {
        return true;
      },
    };
    expect(filter.category).toBe('tone');
    expect(create.brandId).toBe('b-1');
    expect(patch.title).toBe('t2');
    expect(typeof stub.listByBrand).toBe('function');
    expect(typeof stub.findById).toBe('function');
    expect(typeof stub.create).toBe('function');
    expect(typeof stub.update).toBe('function');
    expect(typeof stub.delete).toBe('function');
  });
});
