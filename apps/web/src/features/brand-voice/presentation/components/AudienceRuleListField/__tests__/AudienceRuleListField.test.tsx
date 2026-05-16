import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { AudienceRuleListField } from '../index';
import type { BrandVoiceFormValues } from '../../../validators/brand-voice-form';

interface DefaultRule {
  readonly audience: string;
  readonly rule: string;
}

function Harness({
  defaultValue,
  children,
}: {
  readonly defaultValue: readonly DefaultRule[];
  readonly children: (form: ReturnType<typeof useForm<BrandVoiceFormValues>>) => ReactNode;
}): ReactNode {
  const form = useForm<BrandVoiceFormValues>({
    defaultValues: {
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [...defaultValue],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      toneOfVoice: null,
    } as never,
  });
  return <FormProvider {...form}>{children(form)}</FormProvider>;
}

describe('AudienceRuleListField', () => {
  it('renders the empty placeholder when no rules exist', () => {
    render(
      <Harness defaultValue={[]}>
        {(form) => (
          <AudienceRuleListField
            control={form.control}
            label="Audience rules"
            audienceLabel="Audience"
            ruleLabel="Rule"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing yet"
            audienceMaxLength={120}
            ruleMaxLength={1000}
          />
        )}
      </Harness>,
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('appends a new audience+rule row on add', () => {
    render(
      <Harness defaultValue={[]}>
        {(form) => (
          <AudienceRuleListField
            control={form.control}
            label="Audience rules"
            audienceLabel="Audience"
            ruleLabel="Rule"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing yet"
            audienceMaxLength={120}
            ruleMaxLength={1000}
          />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByRole('textbox', { name: 'Audience 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Rule 1' })).toBeInTheDocument();
  });

  it('renders existing rules and supports removal', () => {
    render(
      <Harness
        defaultValue={[
          { audience: 'Gen Z', rule: 'Peer.' },
          { audience: 'Enterprise', rule: 'Formal.' },
        ]}
      >
        {(form) => (
          <AudienceRuleListField
            control={form.control}
            label="Audience rules"
            audienceLabel="Audience"
            ruleLabel="Rule"
            addLabel="+ Add"
            removeLabel="Remove"
            emptyPlaceholder="Nothing yet"
            audienceMaxLength={120}
            ruleMaxLength={1000}
          />
        )}
      </Harness>,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removes[0]!);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });
});
