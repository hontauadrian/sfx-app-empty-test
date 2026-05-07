import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  OAUTH_ISSUER_URL: z.string().url(),
  OAUTH_JWKS_URL: z.string().url(),
  OAUTH_API_CLIENT_ID: z.string().min(1),
  OAUTH_AUDIENCE: z.string().min(1).optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
}).transform((config) => ({
  ...config,
  OAUTH_AUDIENCE: config.OAUTH_AUDIENCE ?? config.OAUTH_API_CLIENT_ID,
}));

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.errors
      .map((error) => `  ${error.path.join('.')}: ${error.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
