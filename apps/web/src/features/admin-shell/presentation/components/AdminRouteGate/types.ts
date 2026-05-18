import type { ReactNode } from 'react';

export interface AdminRouteGateProps {
  readonly children: ReactNode;
}

export type AdminRouteGateUIModel =
  | { readonly status: 'loading' }
  | { readonly status: 'allowed' }
  | {
      readonly status: 'denied';
      readonly title: string;
      readonly message: string;
      readonly backToHomeLabel: string;
      readonly backToHomeHref: string;
    };

export interface UseAdminRouteGateReturn {
  readonly uiModel: AdminRouteGateUIModel;
}
