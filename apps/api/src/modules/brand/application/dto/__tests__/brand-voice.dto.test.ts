import 'reflect-metadata';
import {
  BrandVoiceApprovedExampleDto,
  BrandVoiceAudienceRuleDto,
  BrandVoiceDto,
  BrandVoiceMessagingPillarDto,
  BrandVoiceRejectedExampleDto,
} from '../brand-voice.dto';

const EXPECTED_FIELDS: ReadonlyArray<keyof BrandVoiceDto> = [
  'brandId',
  'tone',
  'preferredVocabulary',
  'restrictedVocabulary',
  'messagingPillars',
  'writingStyleRules',
  'audienceRules',
  'approvedExamples',
  'rejectedExamples',
  'createdAt',
  'updatedAt',
];

function meta(target: object, field: string): { type?: unknown; nullable?: boolean; isArray?: boolean } | undefined {
  return Reflect.getMetadata('swagger/apiModelProperties', target, field) as
    | { type?: unknown; nullable?: boolean; isArray?: boolean }
    | undefined;
}

describe('BrandVoiceDto', () => {
  it('is instantiable as a plain class', () => {
    expect(new BrandVoiceDto()).toBeInstanceOf(BrandVoiceDto);
  });

  it.each(EXPECTED_FIELDS)('%s carries an explicit `type`', (field) => {
    const m = meta(BrandVoiceDto.prototype, field as string);
    expect(m, `metadata for ${field}`).toBeDefined();
    expect(m?.type, `type for ${field}`).toBeDefined();
  });

  it('messagingPillars is declared as an array of the pillar DTO', () => {
    const m = meta(BrandVoiceDto.prototype, 'messagingPillars');
    expect(m?.isArray).toBe(true);
  });
});

describe('BrandVoice sub-DTOs', () => {
  it('messaging pillar declares title + description', () => {
    expect(meta(BrandVoiceMessagingPillarDto.prototype, 'title')?.type).toBeDefined();
    expect(meta(BrandVoiceMessagingPillarDto.prototype, 'description')?.type).toBeDefined();
  });

  it('audience rule declares audience + rules', () => {
    expect(meta(BrandVoiceAudienceRuleDto.prototype, 'audience')?.type).toBeDefined();
    expect(meta(BrandVoiceAudienceRuleDto.prototype, 'rules')?.type).toBeDefined();
  });

  it('approved example declares phrase', () => {
    expect(meta(BrandVoiceApprovedExampleDto.prototype, 'phrase')?.type).toBeDefined();
  });

  it('rejected example marks reason as nullable', () => {
    const m = meta(BrandVoiceRejectedExampleDto.prototype, 'reason');
    expect(m?.nullable).toBe(true);
  });
});
