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
 * Examples:
 *   @ResourceCaptures({ fromPath: 'id', resource: 'team', pathParam: 'id' })
 *   create(...) { ... }
 *
 *   @ResourceCaptures(
 *     { fromPath: 'id',     resource: 'membership', pathParam: 'membershipId' },
 *     { fromPath: 'userId', resource: 'user',       pathParam: 'userId' },
 *   )
 *   addMember(...) { ... }
 */
export function ResourceCaptures(...captures: ResourceCapture[]) {
  return applyDecorators(
    SetMetadata(RESOURCE_CAPTURES_KEY, captures),
    ApiExtension('x-resource-captures', captures),
  );
}
