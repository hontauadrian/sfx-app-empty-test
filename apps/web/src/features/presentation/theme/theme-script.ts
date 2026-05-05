import { lightColors, darkColors, CSS_VAR_MAP } from './colors';
import type { Colors } from './types';

function generateCssVarString(colors: Colors): string {
  return Object.entries(CSS_VAR_MAP)
    .map(([key, varName]) => `--${varName}:${colors[key as keyof Colors]}`)
    .join(';');
}

export function getThemeScript(): string {
  const lightVars = generateCssVarString(lightColors);
  const darkVars = generateCssVarString(darkColors);

  return `
    (function() {
      try {
        var mode = localStorage.getItem('theme-mode') || 'light';
        var html = document.documentElement;
        if (mode === 'dark') {
          html.classList.add('dark');
          html.setAttribute('style', '${darkVars}');
        } else {
          html.classList.remove('dark');
          html.setAttribute('style', '${lightVars}');
        }
      } catch (e) {}
    })();
  `.trim();
}
