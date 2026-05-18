import { zodResolver } from '@hookform/resolvers/zod';
import { upsertVisualIdentitySchema } from '@sfx/validation';

export const upsertVisualIdentityResolver = zodResolver(upsertVisualIdentitySchema);
