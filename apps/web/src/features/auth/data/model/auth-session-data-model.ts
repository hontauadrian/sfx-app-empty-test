export interface AuthSessionDataModel {
  readonly isAuthenticated: boolean;
  readonly subject: string;
  readonly email: string | null;
  readonly roles: string[];
}
