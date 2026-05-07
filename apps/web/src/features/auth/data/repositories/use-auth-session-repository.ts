import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AUTH_SESSION_QUERY_KEY } from '../../constants';
import { mapToAuthSession, type AuthSession } from '../mapper/map-to-auth-session';
import { fetchAuthSession } from '../remote/fetch-auth-session';
import type { AuthSessionDataModel } from '../model/auth-session-data-model';

export function useAuthSessionRepository(): UseQueryResult<AuthSession> {
  return useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: fetchAuthSession,
    select: (data: AuthSessionDataModel) => mapToAuthSession(data),
    retry: false,
  });
}
