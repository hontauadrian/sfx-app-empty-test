import { OAUTH2_PROXY_LOGOUT_HREF } from '../constants';

describe('auth constants', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI;
    delete process.env.NEXT_PUBLIC_OIDC_LOGOUT_ENDPOINT;
    delete process.env.NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID;
  });

  it('builds an absolute oauth2-proxy sign out URL for direct web-port access', () => {
    const logoutUrl = new URL(OAUTH2_PROXY_LOGOUT_HREF);

    expect(logoutUrl.origin).toBe('http://app.localtest.me:4181');
    expect(logoutUrl.pathname).toBe('/oauth2/sign_out');
    expect(logoutUrl.searchParams.get('rd')).toContain(
      'http://keycloak.localtest.me:9080/realms/sfx-webapp-boilerplate/protocol/openid-connect/logout',
    );
  });

  it('rewrites host.docker.internal logout redirects to the visible localtest host', async () => {
    process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI = 'http://host.docker.internal:36544/';
    process.env.NEXT_PUBLIC_OIDC_LOGOUT_ENDPOINT =
      'http://host.docker.internal:37544/realms/sfx-webapp-boilerplate/protocol/openid-connect/logout';
    process.env.NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID = 'sfx-webapp-boilerplate-dev-proxy';
    vi.stubGlobal('window', {
      location: {
        hostname: 'app.localtest.me',
      },
    });
    vi.resetModules();

    const { getOAuth2ProxyLogoutHref } = await import('../constants');
    const logoutUrl = new URL(getOAuth2ProxyLogoutHref());
    const redirectUrl = new URL(logoutUrl.searchParams.get('rd') ?? '');

    expect(logoutUrl.origin).toBe('http://app.localtest.me:36544');
    expect(redirectUrl.origin).toBe('http://keycloak.localtest.me:37544');
    expect(redirectUrl.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://app.localtest.me:36544/',
    );
  });
});
