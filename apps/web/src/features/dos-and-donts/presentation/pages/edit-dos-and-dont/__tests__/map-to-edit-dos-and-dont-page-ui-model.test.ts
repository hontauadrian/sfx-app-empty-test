import { describe, expect, it } from 'vitest';
import {
  buildDefaultValues,
  mapToEditDosAndDontPageUIModel,
} from '../map-to-edit-dos-and-dont-page-ui-model';

const translations = {
  editDosAndDontPageTitle: 'Edit',
  dosAndDontSubmitLabel: 'Save',
  dosAndDontCancelLabel: 'Cancel',
  error: 'Error',
  dosAndDontNotFound: 'Not found',
} as never;

describe('buildDefaultValues', () => {
  it('returns empty defaults when the entry is undefined', () => {
    expect(buildDefaultValues(undefined)).toEqual({
      type: 'do',
      category: 'tone',
      title: '',
      body: '',
    });
  });

  it('mirrors the entry into form values when populated', () => {
    expect(
      buildDefaultValues({
        id: 'e-1',
        brandId: 'b-1',
        type: 'dont',
        category: 'visuals',
        title: 't',
        body: 'b',
        suggestedCorrection: 'fix',
        createdAt: new Date('2026-05-15T00:00:00.000Z'),
        updatedAt: new Date('2026-05-15T00:00:00.000Z'),
      }),
    ).toEqual({
      type: 'dont',
      category: 'visuals',
      title: 't',
      body: 'b',
      suggestedCorrection: 'fix',
    });
  });
});

describe('mapToEditDosAndDontPageUIModel', () => {
  it('sets loading / notFound / hasError flags through', () => {
    const ui = mapToEditDosAndDontPageUIModel({
      translations,
      entry: undefined,
      isLoading: true,
      notFound: false,
      hasError: false,
      serverError: null,
    });
    expect(ui.isLoading).toBe(true);
    expect(ui.notFound).toBe(false);
  });
});
