import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const BODY_RESOURCE_REFS_KEY = 'sfx:body-resource-refs';

export interface BodyResourceRef {
  /** Body field that references an existing foreign resource. Examples: 'email', 'ownerId', 'projectSlug', 'taskIds'. */
  parentField: string;
  /** Creator endpoint discovered via NestJS operationId. Mutually exclusive with `resource`. */
  parentCreate?: { operationId: string };
  /** Creator endpoint discovered via path. Mutually exclusive with `parentCreate`. Example: '/api/v1/auth/register'. */
  resource?: string;
  /** JSONPath into creator's success response (envelope-applied automatically). Example: '$.email', '$.data.user.id'. Defaults to `@ResourceCaptures` declaration on the creator if omitted. */
  captureFrom?: string;
  /** Field shape. 'scalar' (default) substitutes a single captured id. 'array' pre-creates `count` parents and substitutes an array of ids — used by bulk endpoints whose body field is an array of FKs (e.g. `taskIds: string[]`). */
  kind?: 'scalar' | 'array';
  /** For `kind: 'array'`: number of parents to pre-create. Default 2. */
  count?: number;
}

/**
 * Declares which body fields reference an existing resource that the probe must
 * pre-create before exercising this endpoint. Symmetric to `@ResourceCaptures`
 * (path-param producer) — `BodyResourceRefs` marks the consumer side for body
 * fields. Used by the runtime probe to emit a `chain:resource-setup:<name>`
 * pre-flow, then substitute the captured value into this endpoint's body so
 * the :happy flow no longer hits "X not found".
 *
 * Apply to any endpoint whose request body field points at a record that must
 * already exist (invite-by-email, transfer-ownership-by-userId, share-with-org,
 * follow-by-username, etc).
 *
 * Examples:
 *   // POST /teams/:id/members invites an existing user by email
 *   @BodyResourceRefs({
 *     parentField: 'email',
 *     parentCreate: { operationId: 'register' },
 *     captureFrom: '$.email',
 *   })
 *   inviteMember(...) { ... }
 *
 *   // POST /projects assigns an existing user as owner
 *   @BodyResourceRefs({
 *     parentField: 'ownerId',
 *     parentCreate: { operationId: 'register' },
 *     captureFrom: '$.id',
 *   })
 *   createProject(...) { ... }
 */
export function BodyResourceRefs(...refs: BodyResourceRef[]) {
  return applyDecorators(
    SetMetadata(BODY_RESOURCE_REFS_KEY, refs),
    ApiExtension('x-probe-resource-ref', refs),
  );
}
