import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { mapToAuthGateUIModel } from '../map-to-auth-gate-ui-model';

const EXPECTED_LOGOUT_HREF =
  'http://app.localtest.me:4181/oauth2/sign_out?rd=http%3A%2F%2Fkeycloak.localtest.me%3A9080%2Frealms%2Fsfx-webapp-boilerplate%2Fprotocol%2Fopenid-connect%2Flogout%3Fclient_id%3Dsfx-webapp-boilerplate-dev-proxy%26post_logout_redirect_uri%3Dhttp%253A%252F%252Fapp.localtest.me%253A4181%252F';

describe('mapToAuthGateUIModel', () => {
  it('renders children when the session has app access', () => {
    const model = mapToAuthGateUIModel({
      translations: enCommon,
      isLoading: false,
      logoutHref: EXPECTED_LOGOUT_HREF,
      session: {
        isAuthenticated: true,
        subject: 'user-1',
        email: 'user@example.com',
        roles: ['viewer'],
        hasAppAccess: true,
      },
    });

    expect(model.shouldRenderChildren).toBe(true);
  });

  it('shows pending-access labels when the session has no app access', () => {
    const model = mapToAuthGateUIModel({
      translations: enCommon,
      isLoading: false,
      logoutHref: EXPECTED_LOGOUT_HREF,
      session: {
        isAuthenticated: true,
        subject: 'user-1',
        email: 'user@example.com',
        roles: [],
        hasAppAccess: false,
      },
    });

    expect(model.shouldRenderChildren).toBe(false);
    expect(model.title).toBe(enCommon.pendingAccessTitle);
    expect(model.message).toBe(enCommon.pendingAccessMessage);
    expect(model.logoutLabel).toBe(enCommon.logout);
    expect(model.logoutHref).toBe(EXPECTED_LOGOUT_HREF);
  });
});
