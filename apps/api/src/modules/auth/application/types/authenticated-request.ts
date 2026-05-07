import type { RequestWithAuthenticatedUser } from '../../../../common/guards/jwt-auth.guard';

export interface AuthenticatedRequest extends RequestWithAuthenticatedUser {
  readonly user: NonNullable<RequestWithAuthenticatedUser['user']>;
}
