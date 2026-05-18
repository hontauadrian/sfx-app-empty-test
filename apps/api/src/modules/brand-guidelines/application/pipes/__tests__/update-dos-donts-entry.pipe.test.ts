import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpdateDosDontsEntryPipe } from '../update-dos-donts-entry.pipe';

describe('UpdateDosDontsEntryPipe', () => {
  const pipe = new UpdateDosDontsEntryPipe();

  it('passes an empty body unchanged', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('accepts a partial body', () => {
    expect(pipe.transform({ ruleText: 'New' })).toEqual({ ruleText: 'New' });
  });

  it('rejects empty ruleText', () => {
    expect(() => pipe.transform({ ruleText: '' })).toThrow(BadRequestException);
  });
});
