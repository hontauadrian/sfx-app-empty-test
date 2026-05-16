import { describe, expect, it } from 'vitest';
import type { StringListFieldName } from '../types';

describe('StringListFieldName', () => {
  it('accepts each known list field name', () => {
    const names: StringListFieldName[] = [
      'preferredVocabulary',
      'restrictedVocabulary',
      'messagingPillars',
      'writingStyleRules',
      'approvedExamplePhrases',
      'rejectedExamplePhrases',
    ];
    expect(names).toHaveLength(6);
  });
});
