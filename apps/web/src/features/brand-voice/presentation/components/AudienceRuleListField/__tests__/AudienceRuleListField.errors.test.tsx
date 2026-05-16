import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { AudienceRuleListField } from '../index';
import type { BrandVoiceFormValues } from '../../../validators/brand-voice-form';

interface HarnessProps {
  readonly children: (form: ReturnType<typeof useForm<BrandVoiceFormValues>>) => ReactNode;
  readonly setErrors: (form: ReturnType<typeof useForm<BrandVoiceFormValues>>) => void;
}

function Harness({ children, setErrors }: HarnessProps): ReactNode {
  const form = useForm<BrandVoiceFormValues>({
    defaultValues: {
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [
        { audience: 'Gen Z', rule: 'Peer.' },
        { audience: 'Enterprise', rule: 'Formal.' },
      ],
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

describe('AudienceRuleListField error rendering', () => {
  it('renders the root-level array error', () => {
    render(
      <Harness
        setErrors={(form) => {
          form.setError('audienceRules' as never, {
            type: 'manual',
            message: 'Duplicate audience',
          });
        }}
      >
        {(form) => (
          <AudienceRuleListField
            control={form.control}
            label="Audience"
            audienceLabel="A"
            ruleLabel="R"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing"
            audienceMaxLength={120}
            ruleMaxLength={1000}
          />
        )}
      </Harness>,
    );
    expect(screen.getByText('Duplicate audience')).toBeInTheDocument();
  });

  it('renders per-row audience and rule errors', () => {
    render(
      <Harness
        setErrors={(form) => {
          form.setError('audienceRules.0.audience' as never, {
            type: 'manual',
            message: 'Audience required',
          });
          form.setError('audienceRules.1.rule' as never, {
            type: 'manual',
            message: 'Rule required',
          });
        }}
      >
        {(form) => (
          <AudienceRuleListField
            control={form.control}
            label="Audience"
            audienceLabel="A"
            ruleLabel="R"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing"
            audienceMaxLength={120}
            ruleMaxLength={1000}
          />
        )}
      </Harness>,
    );
    expect(screen.getByText('Audience required')).toBeInTheDocument();
    expect(screen.getByText('Rule required')).toBeInTheDocument();
  });
});
