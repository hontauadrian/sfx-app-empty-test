import { describe, expect, it } from 'vitest';
import { BrandVoiceModule } from '../brand-voice.module';
import { BrandVoiceController } from '../application/controllers/brand-voice.controller';
import { BrandVoiceRepository } from '../data/repositories/brand-voice.repository';

describe('BrandVoiceModule', () => {
  it('is a class that can be referenced by name', () => {
    expect(typeof BrandVoiceModule).toBe('function');
    expect(BrandVoiceModule.name).toBe('BrandVoiceModule');
  });

  it('co-located controller and repository classes are exported and importable', () => {
    expect(typeof BrandVoiceController).toBe('function');
    expect(typeof BrandVoiceRepository).toBe('function');
  });
});
