export type SidebarNavKey = 'home' | 'admin';

export interface SidebarNavItem {
  readonly key: SidebarNavKey;
  readonly label: string;
  readonly href: string;
  readonly isActive: boolean;
}

export type SidebarUIModel =
  | { readonly status: 'loading' }
  | { readonly status: 'hidden' }
  | {
      readonly status: 'visible';
      readonly items: readonly SidebarNavItem[];
      readonly navAriaLabel: string;
    };

export interface UseSidebarReturn {
  readonly uiModel: SidebarUIModel;
}
