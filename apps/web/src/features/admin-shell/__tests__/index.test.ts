import { describe, expect, it } from 'vitest';
import * as adminShell from '../index';

describe('admin-shell barrel', () => {
  it('exposes Sidebar, AdminRouteGate, and AdminTabBar', () => {
    expect(typeof adminShell.Sidebar).toBe('function');
    expect(typeof adminShell.AdminRouteGate).toBe('function');
    expect(typeof adminShell.AdminTabBar).toBe('function');
  });

  it('does not re-export AdminLandingPage (deleted in F3)', () => {
    expect('AdminLandingPage' in adminShell).toBe(false);
  });
});
