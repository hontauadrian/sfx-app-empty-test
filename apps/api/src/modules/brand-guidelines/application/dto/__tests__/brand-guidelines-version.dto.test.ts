import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  BrandGuidelinesSnapshotDto,
  BrandGuidelinesVersionDto,
  BrandGuidelinesVersionsPageDto,
} from '../brand-guidelines-version.dto';

const DTO_METADATA_KEY = 'swagger/apiModelPropertiesArray';

function listProps(target: object): string[] {
  const arr = Reflect.getMetadata(DTO_METADATA_KEY, target) as string[] | undefined;
  return (arr ?? []).map((s) => s.replace(/^:/, ''));
}

describe('BrandGuidelinesSnapshotDto', () => {
  it('instantiates without throwing', () => {
    const dto = new BrandGuidelinesSnapshotDto();
    expect(dto).toBeInstanceOf(BrandGuidelinesSnapshotDto);
  });

  it('declares voice, visual, dosAndDonts, metadata properties', () => {
    const props = listProps(BrandGuidelinesSnapshotDto.prototype);
    expect(props).toContain('voice');
    expect(props).toContain('visual');
    expect(props).toContain('dosAndDonts');
    expect(props).toContain('metadata');
  });
});

describe('BrandGuidelinesVersionDto', () => {
  it('instantiates without throwing', () => {
    expect(new BrandGuidelinesVersionDto()).toBeInstanceOf(BrandGuidelinesVersionDto);
  });

  it('declares every documented property', () => {
    const props = listProps(BrandGuidelinesVersionDto.prototype);
    for (const expected of [
      'id',
      'brandId',
      'snapshot',
      'editorUserId',
      'editorDisplayName',
      'changeNote',
      'createdAt',
    ]) {
      expect(props).toContain(expected);
    }
  });
});

describe('BrandGuidelinesVersionsPageDto', () => {
  it('instantiates without throwing', () => {
    expect(new BrandGuidelinesVersionsPageDto()).toBeInstanceOf(BrandGuidelinesVersionsPageDto);
  });

  it('declares items + nextCursor', () => {
    const props = listProps(BrandGuidelinesVersionsPageDto.prototype);
    expect(props).toContain('items');
    expect(props).toContain('nextCursor');
  });
});
