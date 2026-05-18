import { describe, expect, it } from 'vitest';
import {
  validateUpsertDosDontsEntry,
  type UpsertDosDontsValidationMessages,
} from '../upsert-dos-donts-entry.resolver';

const messages: UpsertDosDontsValidationMessages = {
  typeRequired: 'Type is required',
  categoryRequired: 'Category is required',
  categoryUnknown: 'Unknown category',
  ruleTextRequired: 'Rule text is required',
  ruleTextTooLong: 'Rule text must be 4000 characters or fewer',
  exampleTextTooLong: 'Example must be 4000 characters or fewer',
};

describe('validateUpsertDosDontsEntry', () => {
  it('passes a valid payload', () => {
    expect(
      validateUpsertDosDontsEntry(
        { type: 'do', category: 'tone', ruleText: 'r', exampleText: '' },
        messages,
      ),
    ).toEqual({});
  });

  it('flags missing type / category / rule', () => {
    const errors = validateUpsertDosDontsEntry(
      { type: '', category: '', ruleText: '   ', exampleText: '' },
      messages,
    );
    expect(errors.type).toBe(messages.typeRequired);
    expect(errors.category).toBe(messages.categoryRequired);
    expect(errors.ruleText).toBe(messages.ruleTextRequired);
  });

  it('flags rule text > 4000 chars', () => {
    const errors = validateUpsertDosDontsEntry(
      { type: 'do', category: 'tone', ruleText: 'x'.repeat(4001), exampleText: '' },
      messages,
    );
    expect(errors.ruleText).toBe(messages.ruleTextTooLong);
  });

  it('flags example text > 4000 chars', () => {
    const errors = validateUpsertDosDontsEntry(
      { type: 'do', category: 'tone', ruleText: 'r', exampleText: 'x'.repeat(4001) },
      messages,
    );
    expect(errors.exampleText).toBe(messages.exampleTextTooLong);
  });
});
