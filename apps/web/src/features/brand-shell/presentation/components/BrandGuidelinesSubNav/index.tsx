'use client';

import { type ReactNode } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import type { BrandGuidelinesSubNavEntry } from '../../../constants';
import { BrandVoiceForm } from '../BrandVoiceForm';
import { VisualIdentityForm } from '../VisualIdentityForm';
import { DosAndDontsList } from '../DosAndDontsList';
import { MetadataForm } from '../MetadataForm';
import { useBrandGuidelinesSubNav } from './use-brand-guidelines-sub-nav';
import type { BrandGuidelinesSubNavProps } from './types';

export function BrandGuidelinesSubNav(props: BrandGuidelinesSubNavProps): ReactNode {
  const translations = useTranslations('common');
  const subNav = translations.adminBrandGuidelines.subNav!;

  const renderBody = (entry: BrandGuidelinesSubNavEntry): ReactNode => {
    if (entry.id === 'voice') {
      return (
        <BrandVoiceForm
          brandId={props.activeBrandId}
          onDirtyChange={(dirty) => handleDirtyChange('voice', dirty)}
        />
      );
    }
    if (entry.id === 'visual') {
      return (
        <VisualIdentityForm
          brandId={props.activeBrandId}
          onDirtyChange={(dirty) => handleDirtyChange('visual', dirty)}
        />
      );
    }
    if (entry.id === 'dosAndDonts') {
      return <DosAndDontsList brandId={props.activeBrandId} />;
    }
    if (entry.id === 'metadata') {
      return <MetadataForm brandId={props.activeBrandId} />;
    }
    return (
      <section className="rounded-lg border border-border bg-card p-6">
        <p className="text-muted-foreground">{subNav.placeholderComingNextChunk}</p>
      </section>
    );
  };

  const { uiModel, handleSelectTab, handleDirtyChange } = useBrandGuidelinesSubNav({
    renderBody,
  });

  return (
    <section
      data-testid="brand-guidelines-sub-nav"
      className="mt-6 flex flex-col gap-4"
    >
      <nav aria-label={uiModel.navAriaLabel} className="flex flex-wrap gap-2">
        {uiModel.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`brand-guidelines-sub-nav-tab-${tab.id}`}
            onClick={() => handleSelectTab(tab.id)}
            aria-current={tab.isActive ? 'page' : undefined}
            className={
              tab.isActive
                ? 'min-h-11 rounded-md border border-border bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground'
                : 'min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted'
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div data-testid={`brand-guidelines-sub-nav-body-${uiModel.activeId}`}>
        {uiModel.activeBody}
      </div>
    </section>
  );
}
