import { BadRequestException } from '@nestjs/common';
import { CreateBrandPipe } from '../create-brand.pipe';

describe('CreateBrandPipe', () => {
  const pipe = new CreateBrandPipe();

  it('passes a valid payload through unchanged', () => {
    expect(pipe.transform({ name: 'Acme Holdings' })).toEqual({ name: 'Acme Holdings' });
  });

  it('trims surrounding whitespace from name', () => {
    expect(pipe.transform({ name: '  Acme  ' })).toEqual({ name: 'Acme' });
  });

  it('throws BadRequestException when name is missing', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('throws BadRequestException for empty string name', () => {
    expect(() => pipe.transform({ name: '' })).toThrow(BadRequestException);
  });

  it('throws BadRequestException when name is whitespace only (trim → empty)', () => {
    expect(() => pipe.transform({ name: '   ' })).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a 201-char name', () => {
    expect(() => pipe.transform({ name: 'x'.repeat(201) })).toThrow(BadRequestException);
  });

  it('throws BadRequestException for unknown body keys (.strict)', () => {
    expect(() => pipe.transform({ name: 'Acme', slug: 'acme' })).toThrow(BadRequestException);
  });

  it('serialises validation failure with per-field error list', () => {
    let captured: unknown;
    try {
      pipe.transform({});
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const body = (captured as BadRequestException).getResponse() as {
      message: string;
      errors: Array<{ field: string; message: string }>;
    };
    expect(body.message).toBe('Validation failed');
    expect(body.errors.some((e) => e.field === 'name')).toBe(true);
  });
});
