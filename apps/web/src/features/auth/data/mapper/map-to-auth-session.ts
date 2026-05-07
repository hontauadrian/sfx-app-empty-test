import type { AuthSessionDataModel } from '../model/auth-session-data-model';

export interface AuthSession {
  readonly isAuthenticated: boolean;
  readonly subject: string;
  readonly email: string | null;
  readonly roles: string[];
  readonly hasAppAccess: boolean;
}

export function mapToAuthSession(data: AuthSessionDataModel): AuthSession {
  return {
    isAuthenticated: data.isAuthenticated,
    subject: data.subject,
    email: data.email,
    roles: data.roles,
    hasAppAccess: data.roles.length > 0,
  };
}
