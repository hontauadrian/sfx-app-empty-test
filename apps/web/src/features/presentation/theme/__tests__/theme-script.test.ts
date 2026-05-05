import { getThemeScript } from '../theme-script';

describe('getThemeScript', () => {
  it('returns an inline script string', () => {
    const script = getThemeScript();
    expect(script).toContain('localStorage.getItem');
    expect(script).toContain('theme-mode');
    expect(script).toContain('document.documentElement');
  });

  it('embeds light and dark CSS variable sets', () => {
    const script = getThemeScript();
    expect(script).toContain('--background:');
    expect(script).toContain('classList.add');
    expect(script).toContain('classList.remove');
  });
});
