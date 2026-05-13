import type { ReactNode } from 'react';

export interface AuthGateProps {
  readonly children: ReactNode;
}

export interface AuthGateUIModel {
  readonly shouldRenderChildren: boolean;
  readonly isLoading: boolean;
  readonly title: string;
  readonly message: string;
  readonly logoutLabel: string;
  readonly logoutHref: string;
}

export interface UseAuthGateReturn {
  readonly uiModel: AuthGateUIModel;
}
