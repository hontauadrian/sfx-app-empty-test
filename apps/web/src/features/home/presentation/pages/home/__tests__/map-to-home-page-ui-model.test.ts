import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { mapToHomePageUIModel } from '../map-to-home-page-ui-model';

const translations = enCommon;
const EXPECTED_LOGOUT_HREF =
  '/oauth2/sign_out?rd=http%3A%2F%2Fkeycloak.localtest.me%3A9080%2Frealms%2Fsfx-webapp-boilerplate%2Fprotocol%2Fopenid-connect%2Flogout%3Fclient_id%3Dsfx-webapp-boilerplate-dev-proxy%26post_logout_redirect_uri%3Dhttp%253A%252F%252Fapp.localtest.me%253A4181%252F';

describe('mapToHomePageUIModel', () => {
  it('shows loading text while loading', () => {
    const model = mapToHomePageUIModel({
      translations,
      health: undefined,
      isLoading: true,
      isError: false,
    });
    expect(model.statusText).toBe(translations.loading);
    expect(model.isLoading).toBe(true);
    expect(model.isHealthy).toBe(false);
  });

  it('shows connected when healthy and loaded', () => {
    const model = mapToHomePageUIModel({
      translations,
      health: {
        isHealthy: true,
        databaseConnected: true,
        checkedAt: new Date(),
      },
      isLoading: false,
      isError: false,
    });
    expect(model.statusText).toBe(translations.connected);
    expect(model.isHealthy).toBe(true);
  });

  it('shows disconnected when unhealthy', () => {
    const model = mapToHomePageUIModel({
      translations,
      health: {
        isHealthy: false,
        databaseConnected: true,
        checkedAt: new Date(),
      },
      isLoading: false,
      isError: false,
    });
    expect(model.statusText).toBe(translations.disconnected);
    expect(model.isHealthy).toBe(false);
  });

  it('prioritizes error over health', () => {
    const model = mapToHomePageUIModel({
      translations,
      health: {
        isHealthy: true,
        databaseConnected: true,
        checkedAt: new Date(),
      },
      isLoading: false,
      isError: true,
    });
    expect(model.statusText).toBe(translations.disconnected);
    expect(model.isError).toBe(true);
  });

  it('sets title and labels from translations', () => {
    const model = mapToHomePageUIModel({
      translations,
      health: undefined,
      isLoading: true,
      isError: false,
    });
    expect(model.title).toBe(translations.appName);
    expect(model.healthLabel).toBe(translations.healthStatus);
  });

  it('exposes an API docs CTA', () => {
    const model = mapToHomePageUIModel({
      translations,
      health: undefined,
      isLoading: false,
      isError: false,
    });
    expect(model.ctaLabel).toBe(translations.apiDocs);
    expect(model.ctaHref).toBe('/api/docs');
  });

  it('exposes a logout action', () => {
    const model = mapToHomePageUIModel({
      translations,
      health: undefined,
      isLoading: false,
      isError: false,
    });
    expect(model.logoutLabel).toBe(translations.logout);
    expect(model.logoutHref).toBe(EXPECTED_LOGOUT_HREF);
  });
});
