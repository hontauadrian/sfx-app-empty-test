import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const RESOURCE_CAPTURES_KEY = 'sfx:resource-captures';

export interface ResourceCapture {
  /** JSONPath segment in the unwrapped success response. Examples: 'id', 'slug', 'userId', 'data.token'. NO leading '$.'. */
  fromPath: string;
  /** Resource type name. Examples: 'team', 'user', 'project', 'membership'. Used for the resource-ref sigil. */
  resource: string;
  /** Path-param name in sibling routes that this capture satisfies. Examples: 'id', 'userId', 'slug', 'projectId'. */
  pathParam: string;
}

/**
 * Declares which fields on the success response are addressable resource identifiers.
 * Used by the runtime probe to capture values for downstream sibling-route :param substitution.
 *
 * Apply to POST handlers (create endpoints) that return resources referenced by sibling routes.
 *
 * The chain emitter looks up captures by `pathParam`, NOT by resource name. If the same
 * resource id is consumed under multiple placeholder names (e.g. `:id` AND `:teamId` /
 * `:brandId` / `:projectId`), declare ONE additive tuple per placeholder. Same `fromPath`,
 * same `resource`, only `pathParam` differs. Missing aliases trigger
 * `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` from the runtime probe.
 *
 * Examples:
 *   // Sibling routes consume only ':id'.
 *   @ResourceCaptures({ fromPath: 'id', resource: 'team', pathParam: 'id' })
 *   create(...) { ... }
 *
 *   // Same resource, multiple placeholder names. Sibling routes use ':id'
 *   // (PUT/DELETE/GET /teams/:id), nested children use ':teamId'
 *   // (POST /teams/:teamId/members, GET /teams/:teamId/projects, ...).
 *   @ResourceCaptures(
 *     { fromPath: 'id', resource: 'team', pathParam: 'id' },
 *     { fromPath: 'id', resource: 'team', pathParam: 'teamId' },
 *   )
 *   create(...) { ... }
 *
 *   // Different resources captured from one response (membership id + user id).
 *   @ResourceCaptures(
 *     { fromPath: 'id',     resource: 'membership', pathParam: 'membershipId' },
 *     { fromPath: 'userId', resource: 'user',       pathParam: 'userId' },
 *   )
 *   addMember(...) { ... }
 */
export function ResourceCaptures(...captures: ResourceCapture[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(RESOURCE_CAPTURES_KEY, captures),
    ApiExtension('x-resource-captures', captures),
  );
}
