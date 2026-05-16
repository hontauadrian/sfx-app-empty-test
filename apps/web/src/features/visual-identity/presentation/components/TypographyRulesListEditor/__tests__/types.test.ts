import { describe, expect, it } from 'vitest';
import type { TypographyRulesListEditorProps } from '../types';

describe('TypographyRulesListEditorProps', () => {
  it('accepts a fully populated props bag', () => {
    const props: TypographyRulesListEditorProps = {
      control: {} as never,
      label: 'Typography rules',
      roleLabel: 'Role',
      familyLabel: 'Family',
      weightLabel: 'Weight',
      sizeLabel: 'Size',
      notesLabel: 'Notes',
      addLabel: '+ Add',
      removeLabel: 'Remove',
      emptyPlaceholder: 'No rules yet',
      shortMaxLength: 120,
    };
    expect(props.label).toBe('Typography rules');
  });
});
