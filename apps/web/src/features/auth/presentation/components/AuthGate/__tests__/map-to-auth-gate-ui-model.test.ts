import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { mapToAuthGateUIModel } from '../map-to-auth-gate-ui-model';

describe('mapToAuthGateUIModel', () => {
  it('renders children when the session has app access', () => {
    const model = mapToAuthGateUIModel({
      translations: enCommon,
      isLoading: false,
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
    expect(model.logoutHref).toBe('/oauth2/sign_out?rd=/');
  });
});
