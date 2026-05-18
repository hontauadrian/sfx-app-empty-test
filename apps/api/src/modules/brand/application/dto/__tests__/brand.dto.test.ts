import 'reflect-metadata';
import { BrandDto, BrandsListDto } from '../brand.dto';

const EXPECTED_FIELDS: ReadonlyArray<keyof BrandDto> = [
  'id',
  'name',
  'slug',
  'ownerUserId',
  'createdAt',
  'updatedAt',
  'deletedAt',
];

describe('BrandDto', () => {
  it('is instantiable as a plain class', () => {
    const dto = new BrandDto();
    expect(dto).toBeInstanceOf(BrandDto);
  });

  it('declares every expected field via swagger property metadata', () => {
    const recorded = Reflect.getMetadata(
      'swagger/apiModelPropertiesArray',
      BrandDto.prototype,
    ) as string[] | undefined;
    expect(recorded).toBeDefined();
    const trimmed = (recorded ?? []).map((entry) =>
      entry.startsWith(':') ? entry.slice(1) : entry,
    );
    for (const field of EXPECTED_FIELDS) {
      expect(trimmed).toContain(field);
    }
  });

  it.each(EXPECTED_FIELDS)('%s carries an explicit `type` (no reflect-metadata reliance)', (field) => {
    const meta = Reflect.getMetadata(
      'swagger/apiModelProperties',
      BrandDto.prototype,
      field as string,
    ) as { type?: unknown } | undefined;
    expect(meta).toBeDefined();
    expect(meta?.type).toBeDefined();
  });
});

describe('BrandsListDto', () => {
  it('declares brands as an array of BrandDto', () => {
    const meta = Reflect.getMetadata(
      'swagger/apiModelProperties',
      BrandsListDto.prototype,
      'brands',
    ) as { isArray?: boolean; type?: unknown } | undefined;
    expect(meta).toBeDefined();
    expect(meta?.isArray).toBe(true);
  });
});
