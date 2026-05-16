import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { StringListField } from '../index';
import type { BrandVoiceFormValues } from '../../../validators/brand-voice-form';

interface HarnessProps {
  readonly children: (form: ReturnType<typeof useForm<BrandVoiceFormValues>>) => ReactNode;
  readonly setErrors: (form: ReturnType<typeof useForm<BrandVoiceFormValues>>) => void;
}

function Harness({ children, setErrors }: HarnessProps): ReactNode {
  const form = useForm<BrandVoiceFormValues>({
    defaultValues: {
      preferredVocabulary: ['a', 'b'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      toneOfVoice: null,
    } as never,
  });
  useEffect(() => {
    setErrors(form);
  }, [form, setErrors]);
  return <FormProvider {...form}>{children(form)}</FormProvider>;
}

describe('StringListField error rendering', () => {
  it('renders the root-level array error message', () => {
    render(
      <Harness
        setErrors={(form) => {
          form.setError('preferredVocabulary' as never, {
            type: 'manual',
            message: 'Too many items',
          });
        }}
      >
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
    expect(screen.getByText('Too many items')).toBeInTheDocument();
  });

  it('renders per-item error messages', () => {
    render(
      <Harness
        setErrors={(form) => {
          form.setError('preferredVocabulary.0' as never, {
            type: 'manual',
            message: 'Required item',
          });
        }}
      >
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
    expect(screen.getByText('Required item')).toBeInTheDocument();
  });
});
