import { z } from 'zod';
import '../openapi';

export const BRAND_NAME_MIN_LENGTH = 1;
export const BRAND_NAME_MAX_LENGTH = 120;
export const BRAND_DESCRIPTION_MAX_LENGTH = 2000;

export const brandProfileWriteSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(BRAND_NAME_MIN_LENGTH, 'Brand name is required')
      .max(BRAND_NAME_MAX_LENGTH, `Brand name must be at most ${BRAND_NAME_MAX_LENGTH} characters`)
      .openapi({ example: 'Acme Brand', description: 'Human-readable brand name (1..120 after trim)' }),
    description: z
      .string()
      .trim()
      .max(
        BRAND_DESCRIPTION_MAX_LENGTH,
        `Brand description must be at most ${BRAND_DESCRIPTION_MAX_LENGTH} characters`,
      )
      .nullable()
      .optional()
      .openapi({
        example: 'A short summary of the brand',
        description: 'Optional brand description (0..2000 chars after trim). Send null on PUT to clear.',
      }),
  })
  .openapi({ description: 'Body for creating or updating a brand profile' });

export type BrandProfileWriteInput = z.infer<typeof brandProfileWriteSchema>;

export const brandProfileSchema = z
  .object({
    id: z.string().openapi({ example: 'cuid12345', description: 'Brand identifier' }),
    ownerSubject: z
      .string()
      .openapi({ example: 'sub-keycloak-1', description: 'Keycloak subject of the brand owner' }),
    name: z.string().openapi({ example: 'Acme Brand' }),
    description: z
      .string()
      .nullable()
      .openapi({ example: 'A short summary of the brand', description: 'Description or null' }),
    createdAt: z
      .string()
      .openapi({ example: '2026-05-15T10:00:00.000Z', description: 'ISO timestamp' }),
    updatedAt: z
      .string()
      .openapi({ example: '2026-05-15T10:00:00.000Z', description: 'ISO timestamp' }),
  })
  .openapi({ description: 'Brand profile resource' });

export type BrandProfileShape = z.infer<typeof brandProfileSchema>;
