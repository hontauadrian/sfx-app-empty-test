import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_DOS_AND_DONT_VALUES,
  mapToNewDosAndDontPageUIModel,
} from '../map-to-new-dos-and-dont-page-ui-model';

const translations = {
  newDosAndDontPageTitle: 'Title',
  dosAndDontSubmitLabel: 'Save',
  dosAndDontCancelLabel: 'Cancel',
} as never;

describe('mapToNewDosAndDontPageUIModel', () => {
  it('maps translations into the UI model', () => {
    const ui = mapToNewDosAndDontPageUIModel({ translations, serverError: null });
    expect(ui.title).toBe('Title');
    expect(ui.submitLabel).toBe('Save');
    expect(ui.cancelLabel).toBe('Cancel');
    expect(ui.serverErrorLabel).toBeNull();
    expect(ui.defaultValues).toEqual(DEFAULT_NEW_DOS_AND_DONT_VALUES);
  });

  it('reflects a serverError when supplied', () => {
    const ui = mapToNewDosAndDontPageUIModel({ translations, serverError: 'boom' });
    expect(ui.serverErrorLabel).toBe('boom');
  });
});
