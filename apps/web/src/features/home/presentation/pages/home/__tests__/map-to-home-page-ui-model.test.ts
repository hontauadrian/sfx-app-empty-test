import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { mapToHomePageUIModel } from '../map-to-home-page-ui-model';

const translations = enCommon;

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
    expect(model.ctaHref).toMatch(/\/api\/docs$/);
  });
});
