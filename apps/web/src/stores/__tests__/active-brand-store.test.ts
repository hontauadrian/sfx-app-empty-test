import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_BRAND_STORAGE_KEY,
  useActiveBrandStore,
} from '../active-brand-store';

const initialState = useActiveBrandStore.getState();

describe('useActiveBrandStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    useActiveBrandStore.setState(initialState, true);
    window.localStorage.clear();
  });

  it('starts with a null active brand', () => {
    expect(useActiveBrandStore.getState().activeBrandId).toBeNull();
  });

  it('setActiveBrandId updates the value', () => {
    useActiveBrandStore.getState().setActiveBrandId('brand-1');
    expect(useActiveBrandStore.getState().activeBrandId).toBe('brand-1');
  });

  it('setActiveBrandId accepts null to drop the active brand', () => {
    useActiveBrandStore.getState().setActiveBrandId('brand-1');
    useActiveBrandStore.getState().setActiveBrandId(null);
    expect(useActiveBrandStore.getState().activeBrandId).toBeNull();
  });

  it('clear resets the active brand', () => {
    useActiveBrandStore.getState().setActiveBrandId('brand-1');
    useActiveBrandStore.getState().clear();
    expect(useActiveBrandStore.getState().activeBrandId).toBeNull();
  });

  it('persists the active brand id under the documented localStorage key', () => {
    useActiveBrandStore.getState().setActiveBrandId('brand-42');
    const raw = window.localStorage.getItem(ACTIVE_BRAND_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      state: { activeBrandId: string | null };
    };
    expect(parsed.state.activeBrandId).toBe('brand-42');
  });
});
