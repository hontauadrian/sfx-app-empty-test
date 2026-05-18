import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ChangeNoteQueryPipe } from '../change-note-query.pipe';

describe('ChangeNoteQueryPipe', () => {
  const pipe = new ChangeNoteQueryPipe();

  it('accepts an empty query', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('accepts a non-empty changeNote', () => {
    expect(pipe.transform({ changeNote: 'tone tightening' })).toEqual({
      changeNote: 'tone tightening',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(pipe.transform({ changeNote: '  note  ' })).toEqual({ changeNote: 'note' });
  });

  it('rejects changeNote over 500 chars', () => {
    expect(() => pipe.transform({ changeNote: 'x'.repeat(501) })).toThrow(BadRequestException);
  });

  it('rejects unknown query keys', () => {
    expect(() => pipe.transform({ extra: 'x' })).toThrow(BadRequestException);
  });
});
