export type ThemeMode = 'light' | 'dark';

export interface Colors {
  readonly background: string;
  readonly foreground: string;
  readonly card: string;
  readonly cardForeground: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly secondary: string;
  readonly secondaryForeground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly destructive: string;
  readonly destructiveForeground: string;
  readonly border: string;
  readonly input: string;
  readonly ring: string;
}

export interface AppTheme {
  readonly mode: ThemeMode;
  readonly colors: Colors;
  readonly toggleTheme: () => void;
}
