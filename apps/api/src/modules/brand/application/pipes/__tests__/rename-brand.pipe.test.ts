import { BadRequestException } from '@nestjs/common';
import { RenameBrandPipe } from '../rename-brand.pipe';

describe('RenameBrandPipe', () => {
  const pipe = new RenameBrandPipe();

  it('passes a valid payload through', () => {
    expect(pipe.transform({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('trims surrounding whitespace from name', () => {
    expect(pipe.transform({ name: '  Renamed  ' })).toEqual({ name: 'Renamed' });
  });

  it('rejects empty name', () => {
    expect(() => pipe.transform({ name: '' })).toThrow(BadRequestException);
  });

  it('rejects whitespace-only name', () => {
    expect(() => pipe.transform({ name: '   ' })).toThrow(BadRequestException);
  });

  it('rejects oversize name', () => {
    expect(() => pipe.transform({ name: 'x'.repeat(201) })).toThrow(BadRequestException);
  });

  it('rejects unknown keys', () => {
    expect(() => pipe.transform({ name: 'Renamed', slug: 'x' })).toThrow(BadRequestException);
  });

  it('rejects missing name field', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });
});
