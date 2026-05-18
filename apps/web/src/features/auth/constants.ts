export const AUTH_ME_ENDPOINT = 'api/v1/auth/me';
export const AUTH_SESSION_QUERY_KEY = ['auth', 'session'] as const;

const DEFAULT_POST_LOGOUT_REDIRECT_URI = 'http://app.localtest.me:4181/';
const DEFAULT_OIDC_LOGOUT_ENDPOINT =
  'http://keycloak.localtest.me:9080/realms/sfx-webapp-boilerplate/protocol/openid-connect/logout';
const DEFAULT_OAUTH2_PROXY_CLIENT_ID = 'sfx-webapp-boilerplate-dev-proxy';

const postLogoutRedirectUri =
  process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || DEFAULT_POST_LOGOUT_REDIRECT_URI;
const oidcLogoutEndpoint =
  process.env.NEXT_PUBLIC_OIDC_LOGOUT_ENDPOINT || DEFAULT_OIDC_LOGOUT_ENDPOINT;
const oauth2ProxyClientId =
  process.env.NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID || DEFAULT_OAUTH2_PROXY_CLIENT_ID;

function getBrowserHostname(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.hostname;
}

function mapContainerHostToBrowserHost(url: URL, browserHostname: string | null): URL {
  if (url.hostname !== 'host.docker.internal' || browserHostname === null) {
    return url;
  }

  if (browserHostname.endsWith('.localtest.me')) {
    url.hostname = url.pathname.includes('/protocol/openid-connect/logout')
      ? 'keycloak.localtest.me'
      : browserHostname;
  }

  return url;
}

export function getOAuth2ProxyLogoutHref(): string {
  const browserHostname = getBrowserHostname();
  const browserPostLogoutRedirectUrl = mapContainerHostToBrowserHost(
    new URL(postLogoutRedirectUri),
    browserHostname,
  );
  const oidcLogoutUrl = mapContainerHostToBrowserHost(new URL(oidcLogoutEndpoint), browserHostname);

  oidcLogoutUrl.searchParams.set('client_id', oauth2ProxyClientId);
  oidcLogoutUrl.searchParams.set('post_logout_redirect_uri', browserPostLogoutRedirectUrl.toString());

  const oauth2ProxyLogoutUrl = new URL('/oauth2/sign_out', browserPostLogoutRedirectUrl);
  oauth2ProxyLogoutUrl.searchParams.set('rd', oidcLogoutUrl.toString());
  return oauth2ProxyLogoutUrl.toString();
}

export const OAUTH2_PROXY_LOGOUT_HREF = getOAuth2ProxyLogoutHref();
