import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { StringListField } from '../index';
import type { BrandVoiceFormValues } from '../../../validators/brand-voice-form';

function Harness({
  defaultValue,
  children,
}: {
  readonly defaultValue: readonly string[];
  readonly children: (form: ReturnType<typeof useForm<BrandVoiceFormValues>>) => ReactNode;
}): ReactNode {
  const form = useForm<BrandVoiceFormValues>({
    defaultValues: {
      preferredVocabulary: [...defaultValue],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      toneOfVoice: null,
    } as never,
  });
  return <FormProvider {...form}>{children(form)}</FormProvider>;
}

describe('StringListField', () => {
  it('renders the empty placeholder when the array is empty', () => {
    render(
      <Harness defaultValue={[]}>
        {(form) => (
          <StringListField
            control={form.control}
            name="preferredVocabulary"
            label="Preferred"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing yet"
            itemMaxLength={200}
          />
        )}
      </Harness>,
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('appends a new row when the add button is pressed', () => {
    render(
      <Harness defaultValue={[]}>
        {(form) => (
          <StringListField
            control={form.control}
            name="preferredVocabulary"
            label="Preferred"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing yet"
            itemMaxLength={200}
          />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('renders existing items and supports removal', () => {
    render(
      <Harness defaultValue={['craft', 'trust']}>
        {(form) => (
          <StringListField
            control={form.control}
            name="preferredVocabulary"
            label="Preferred"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing yet"
            itemMaxLength={200}
          />
        )}
      </Harness>,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removes[0]!);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('updates input value via change events', () => {
    render(
      <Harness defaultValue={['']}>
        {(form) => (
          <StringListField
            control={form.control}
            name="preferredVocabulary"
            label="Preferred"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing yet"
            itemMaxLength={200}
          />
        )}
      </Harness>,
    );
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0]!, { target: { value: 'craft' } });
    expect(inputs[0]!.value).toBe('craft');
  });
});
