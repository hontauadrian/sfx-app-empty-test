import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BrandVoiceWriteDto } from '../brand-voice-write.dto';

describe('BrandVoiceWriteDto', () => {
  it('accepts a populated write payload', () => {
    const dto = new BrandVoiceWriteDto();
    dto.toneOfVoice = 'Warm.';
    dto.preferredVocabulary = ['craft'];
    dto.audienceRules = [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }];
    expect(dto.toneOfVoice).toBe('Warm.');
    expect(dto.preferredVocabulary).toEqual(['craft']);
    expect(dto.audienceRules).toHaveLength(1);
  });

  it('treats all fields as optional', () => {
    const dto = new BrandVoiceWriteDto();
    expect(dto.toneOfVoice).toBeUndefined();
    expect(dto.preferredVocabulary).toBeUndefined();
  });
});
