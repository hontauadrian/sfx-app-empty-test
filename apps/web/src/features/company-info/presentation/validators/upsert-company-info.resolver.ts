import { zodResolver } from '@hookform/resolvers/zod';
import { upsertCompanyInfoSchema } from '@sfx/validation';

export const upsertCompanyInfoResolver = zodResolver(upsertCompanyInfoSchema);
