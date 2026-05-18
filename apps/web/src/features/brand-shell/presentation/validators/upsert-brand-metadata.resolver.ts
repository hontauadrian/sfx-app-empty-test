export interface BrandMetadataValidationMessages {
  readonly tagTooLong: string;
  readonly tooManyTags: string;
}

export interface BrandMetadataValidationErrors {
  readonly tag?: string;
  readonly tooMany?: string;
}

export function validateBrandMetadataTags(
  tags: readonly string[],
  messages: BrandMetadataValidationMessages,
): BrandMetadataValidationErrors {
  const errors: { -readonly [K in keyof BrandMetadataValidationErrors]: string } = {};
  if (tags.length > 64) {
    errors.tooMany = messages.tooManyTags;
  }
  if (tags.some((tag) => tag.length > 80)) {
    errors.tag = messages.tagTooLong;
  }
  return errors;
}

export function canAcceptTag(
  candidate: string,
  existing: readonly string[],
  messages: BrandMetadataValidationMessages,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = candidate.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > 80) return { ok: false, reason: messages.tagTooLong };
  if (existing.length >= 64) return { ok: false, reason: messages.tooManyTags };
  if (existing.includes(trimmed)) return { ok: false, reason: 'duplicate' };
  return { ok: true };
}
