export interface LeftNavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

export interface LeftNavProps {
  readonly items: readonly LeftNavItem[];
  readonly ariaLabel: string;
}
