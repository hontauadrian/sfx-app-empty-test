import { zodResolver } from '@hookform/resolvers/zod';
import { upsertBrandVoiceSchema } from '@sfx/validation';

export const upsertBrandVoiceResolver = zodResolver(upsertBrandVoiceSchema);
